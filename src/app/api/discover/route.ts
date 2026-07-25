import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorizeSyncRequest } from "@/lib/cron-auth";
import { reconcile } from "@/lib/reconcile";
import { applyDecisionIds } from "@/lib/apply-decisions";
import { nameSimilarity, FUZZY_MATCH_THRESHOLD } from "@/lib/fuzzy-match";
import { hashItems, type DiscoveredItem } from "@/lib/discover-types";

// Single "Discover" endpoint: fetches Vercel + GitHub + Supabase in
// parallel, reconciles them (fuzzy first, Grok for the leftovers), and
// stores every suggestion as a pending AIDecision. IMPORTANT: this route
// never writes to the Project/SyncStamp tables — see /api/discover/apply
// for that. A human has to review and accept before anything changes.
export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const [vercelItems, githubItems, supabaseItems, netlifyItems] =
    await Promise.all([
      fetchVercel(),
      fetchGitHub(),
      fetchSupabase(),
      fetchNetlify(),
    ]);

  const allItems: DiscoveredItem[] = [
    ...vercelItems,
    ...githubItems,
    ...supabaseItems,
    ...netlifyItems,
  ];

  if (allItems.length === 0) {
    return NextResponse.json({
      ok: true,
      message:
        "No source tokens configured, or all sources returned nothing. Nothing to reconcile.",
      sourcesChecked: {
        vercel: vercelItems.length,
        github: githubItems.length,
        supabase: supabaseItems.length,
        netlify: netlifyItems.length,
      },
      runId: null,
      aiUsed: false,
    });
  }

  // Real, current branch names -- never hardcoded. "Unassigned" is a
  // system bucket, not a real branch, so it's excluded from what the AI
  // is allowed to suggest.
  const domains = await prisma.domain.findMany({
    where: { name: { not: "Unassigned" } },
    select: { name: true },
  });
  const domainNames = domains.map((d) => d.name);

  // Skip items that were already resolved (accepted "match" decision) in a
  // prior run -- e.g. adding a Netlify account shouldn't re-send the 140
  // already-merged Vercel/GitHub items back through matching + AI, only
  // the handful of genuinely new items. Identity across runs can't use the
  // run-scoped synthetic ids (e.g. "vercel:0:3" isn't stable run to run),
  // so items are matched by (source, accountLabel, name) instead.
  const acceptedMatches = await prisma.aIDecision.findMany({
    where: { action: { in: ["match", "attach_existing"] }, status: "accepted" },
    include: { run: true },
  });
  const resolvedSignatures = new Set<string>();
  for (const d of acceptedMatches) {
    try {
      const rawItems: DiscoveredItem[] = JSON.parse(d.run.raw);
      const ids: string[] = JSON.parse(d.sourceItemIds);
      for (const id of ids) {
        const item = rawItems.find((r) => r.id === id);
        if (item) {
          resolvedSignatures.add(
            `${item.source}:${item.accountLabel}:${item.name.trim().toLowerCase()}`,
          );
        }
      }
    } catch {
      // malformed historical row -- ignore, item just won't be skipped
    }
  }

  const newItems = allItems.filter(
    (i) =>
      !resolvedSignatures.has(
        `${i.source}:${i.accountLabel}:${i.name.trim().toLowerCase()}`,
      ),
  );

  if (newItems.length === 0) {
    return NextResponse.json({
      ok: true,
      message: `Found ${allItems.length} item(s) across sources, but all of them already have an accepted project match from a previous run. Nothing new to reconcile.`,
      sourcesChecked: {
        vercel: vercelItems.length,
        github: githubItems.length,
        supabase: supabaseItems.length,
        netlify: netlifyItems.length,
      },
      runId: null,
      aiUsed: false,
      decisions: [],
    });
  }

  const inputHash = hashItems(newItems, domainNames);

  const result = await reconcile(newItems, domainNames);

  const run = await prisma.discoverRun.create({
    data: {
      inputHash,
      triggeredBy: auth.actor,
      aiUsed: result.aiUsed,
      raw: JSON.stringify(newItems),
    },
  });

  const decisionRows: {
    runId: string;
    action: string;
    sourceItemIds: string;
    suggestion: string;
    reasoning?: string;
    confidence: number;
    method: string;
  }[] = [];

  for (const m of result.matches) {
    decisionRows.push({
      runId: run.id,
      action: "match",
      sourceItemIds: JSON.stringify(m.itemIds),
      suggestion: JSON.stringify({ suggestedName: m.suggestedName }),
      reasoning: m.reasoning,
      confidence: m.confidence,
      method: m.method,
    });
  }

  // Standalone items (no cross-source duplicate in THIS run) still need to
  // be checked against projects that already exist in the DB from a prior
  // run -- reconcile() only ever compares items within the current batch,
  // so e.g. "superadmin-ams" arriving later from Netlify would otherwise
  // never be checked against the "superadmin" project already sitting in
  // the registry. Exact match first, then fuzzy, same threshold as
  // in-batch matching. Only if neither hits does it become a new project.
  const existingProjects = await prisma.project.findMany({
    select: { id: true, name: true },
  });

  for (const item of result.standalone) {
    const exact = existingProjects.find(
      (p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
    );
    const fuzzy =
      !exact &&
      existingProjects.find(
        (p) => nameSimilarity(item.name, p.name) >= FUZZY_MATCH_THRESHOLD,
      );
    const hit = exact ?? (fuzzy || undefined);

    if (hit) {
      decisionRows.push({
        runId: run.id,
        action: "attach_existing",
        sourceItemIds: JSON.stringify([item.id]),
        suggestion: JSON.stringify({
          existingProjectId: hit.id,
          existingProjectName: hit.name,
        }),
        reasoning: exact
          ? `Matches existing project "${hit.name}" by name.`
          : `Close name match to existing project "${hit.name}".`,
        confidence: exact ? 1 : 0.85,
        method: exact ? "exact" : "fuzzy",
      });
      continue;
    }

    decisionRows.push({
      runId: run.id,
      action: "match",
      sourceItemIds: JSON.stringify([item.id]),
      suggestion: JSON.stringify({ suggestedName: item.name }),
      reasoning: "Only found in one source — nothing to merge it with.",
      confidence: 1,
      method: "standalone",
    });
  }

  for (const b of result.domainSuggestions) {
    decisionRows.push({
      runId: run.id,
      action: "assign_branch",
      sourceItemIds: JSON.stringify([b.itemId]),
      suggestion: JSON.stringify({
        suggestedBranchName: b.suggestedDomainName,
      }),
      reasoning: b.reasoning,
      confidence: b.confidence,
      method: b.method,
    });
  }

  for (const f of result.fieldSuggestions) {
    decisionRows.push({
      runId: run.id,
      action:
        f.suggestedStatus && !f.suggestedDescription
          ? "suggest_status"
          : "suggest_description",
      sourceItemIds: JSON.stringify([f.itemId]),
      suggestion: JSON.stringify({
        suggestedStatus: f.suggestedStatus,
        suggestedDescription: f.suggestedDescription,
      }),
      reasoning: f.reasoning,
      confidence: f.confidence,
      method: f.method,
    });
  }

  if (decisionRows.length > 0) {
    await prisma.aIDecision.createMany({ data: decisionRows });
  }

  const createdDecisions = decisionRows.length
    ? await prisma.aIDecision.findMany({
        where: { runId: run.id },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // Fully automated: apply every decision immediately, no review step.
  const { applied, errors } = createdDecisions.length
    ? await applyDecisionIds(createdDecisions.map((d) => d.id))
    : { applied: 0, errors: [] as string[] };

  if (applied > 0) {
    revalidatePath("/", "layout");
  }

  return NextResponse.json({
    ok: errors.length === 0,
    message: `Found ${allItems.length} item(s) across sources. Auto-applied ${applied} of ${createdDecisions.length} decision(s)${errors.length ? `, ${errors.length} error(s)` : ""}.${result.aiUsed ? "" : ` (AI not used${result.aiError ? ": " + result.aiError : ""} — deterministic matching only.)`}`,
    sourcesChecked: {
      vercel: vercelItems.length,
      github: githubItems.length,
      supabase: supabaseItems.length,
      netlify: netlifyItems.length,
    },
    runId: run.id,
    aiUsed: result.aiUsed,
    aiError: result.aiError,
    applied,
    errors,
  });
}

// Multi-account support: reads VERCEL_API_TOKEN_1, _2, _3... (each with its
// own optional _TEAM_ID / _LABEL). Falls back to the unnumbered
// VERCEL_API_TOKEN for backward compatibility with single-account setups.
function getNetlifyAccounts() {
  const accounts: { token: string; label: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const token = process.env[`NETLIFY_API_TOKEN_${i}`];
    if (!token) continue;
    accounts.push({
      token,
      label: process.env[`NETLIFY_ACCOUNT_LABEL_${i}`] ?? `netlify-${i}`,
    });
  }
  if (accounts.length === 0 && process.env.NETLIFY_API_TOKEN) {
    accounts.push({
      token: process.env.NETLIFY_API_TOKEN,
      label: process.env.NETLIFY_ACCOUNT_LABEL ?? "netlify-account",
    });
  }
  return accounts;
}

async function fetchNetlify(): Promise<DiscoveredItem[]> {
  const accounts = getNetlifyAccounts();
  const results = await Promise.all(
    accounts.map(async (acc, accIdx) => {
      try {
        const res = await fetch("https://api.netlify.com/api/v1/sites", {
          headers: { Authorization: `Bearer ${acc.token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `[discover] Netlify fetch failed (${acc.label}): ${res.status} ${body.slice(0, 300)}`,
          );
          return [];
        }
        const sites = await res.json();
        return sites.map((s: any, idx: number) => ({
          id: `netlify:${accIdx}:${idx}`,
          source: "netlify" as const,
          name: s.name,
          accountLabel: acc.label,
          url: s.ssl_url ?? s.url,
          status: s.state, // "current" | "building" | "error" etc.
        }));
      } catch (err) {
        console.error(`[discover] Netlify fetch threw (${acc.label}):`, err);
        return [];
      }
    }),
  );
  return results.flat();
}

function getVercelAccounts() {
  const accounts: { token: string; teamId?: string; label: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const token = process.env[`VERCEL_API_TOKEN_${i}`];
    if (!token) continue;
    accounts.push({
      token,
      teamId: process.env[`VERCEL_TEAM_ID_${i}`],
      label: process.env[`VERCEL_ACCOUNT_LABEL_${i}`] ?? `vercel-${i}`,
    });
  }
  if (accounts.length === 0 && process.env.VERCEL_API_TOKEN) {
    accounts.push({
      token: process.env.VERCEL_API_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      label: process.env.VERCEL_ACCOUNT_LABEL ?? "vercel-account",
    });
  }
  return accounts;
}

async function fetchVercel(): Promise<DiscoveredItem[]> {
  const accounts = getVercelAccounts();
  const results = await Promise.all(
    accounts.map(async (acc, accIdx) => {
      try {
        const teamQuery = acc.teamId ? `?teamId=${acc.teamId}` : "";
        const res = await fetch(
          `https://api.vercel.com/v9/projects${teamQuery}`,
          {
            headers: { Authorization: `Bearer ${acc.token}` },
            cache: "no-store",
          },
        );
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `[discover] Vercel fetch failed (${acc.label}): ${res.status} ${body.slice(0, 300)}`,
          );
          return [];
        }
        const data = await res.json();
        return (data.projects ?? []).map((vp: any, idx: number) => ({
          id: `vercel:${accIdx}:${idx}`,
          source: "vercel" as const,
          name: vp.name,
          accountLabel: acc.label,
          url: vp.targets?.production?.alias?.[0]
            ? `https://${vp.targets.production.alias[0]}`
            : undefined,
          status: vp.latestDeployments?.[0]?.readyState,
        }));
      } catch (err) {
        console.error(`[discover] Vercel fetch threw (${acc.label}):`, err);
        return [];
      }
    }),
  );
  return results.flat();
}

function getGitHubAccounts() {
  const accounts: { token: string; org?: string; label: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const token = process.env[`GITHUB_TOKEN_${i}`];
    if (!token) continue;
    const org = process.env[`GITHUB_ORG_${i}`];
    accounts.push({
      token,
      org,
      label: process.env[`GITHUB_ACCOUNT_LABEL_${i}`] ?? org ?? `github-${i}`,
    });
  }
  if (accounts.length === 0 && process.env.GITHUB_TOKEN) {
    accounts.push({
      token: process.env.GITHUB_TOKEN,
      org: process.env.GITHUB_ORG,
      label: process.env.GITHUB_ORG ?? "github-org",
    });
  }
  return accounts;
}

async function fetchGitHub(): Promise<DiscoveredItem[]> {
  const accounts = getGitHubAccounts();
  const results = await Promise.all(
    accounts.map(async (acc, accIdx) => {
      try {
        const headers = {
          Authorization: `Bearer ${acc.token}`,
          Accept: "application/vnd.github+json",
        };
        let res = await fetch(
          `https://api.github.com/orgs/${acc.org}/repos?per_page=100`,
          { headers, cache: "no-store" },
        );
        if (res.status === 404) {
          // /users/{username}/repos only returns PUBLIC repos regardless of
          // token scope. If acc.org is actually a personal account, use
          // /user/repos (token's own identity) so private+owned repos show.
          res = await fetch(
            `https://api.github.com/user/repos?per_page=100&affiliation=owner&visibility=all`,
            { headers, cache: "no-store" },
          );
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `[discover] GitHub fetch failed (${acc.label}): ${res.status} ${body.slice(0, 300)}`,
          );
          return [];
        }
        const repos = await res.json();
        return repos.map((repo: any, idx: number) => ({
          id: `github:${accIdx}:${idx}`,
          source: "github" as const,
          name: repo.name,
          accountLabel: acc.label,
          url: repo.html_url,
          description: repo.description ?? undefined,
          language: repo.language ?? undefined,
        }));
      } catch (err) {
        console.error(`[discover] GitHub fetch threw (${acc.label}):`, err);
        return [];
      }
    }),
  );
  return results.flat();
}

function getSupabaseAccounts() {
  const accounts: { token: string; label?: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const token = process.env[`SUPABASE_MANAGEMENT_TOKEN_${i}`];
    if (!token) continue;
    accounts.push({ token, label: process.env[`SUPABASE_ACCOUNT_LABEL_${i}`] });
  }
  if (accounts.length === 0 && process.env.SUPABASE_MANAGEMENT_TOKEN) {
    accounts.push({ token: process.env.SUPABASE_MANAGEMENT_TOKEN });
  }
  return accounts;
}

async function fetchSupabase(): Promise<DiscoveredItem[]> {
  const accounts = getSupabaseAccounts();
  const results = await Promise.all(
    accounts.map(async (acc, accIdx) => {
      try {
        const res = await fetch("https://api.supabase.com/v1/projects", {
          headers: { Authorization: `Bearer ${acc.token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `[discover] Supabase fetch failed (account ${accIdx + 1}): ${res.status} ${body.slice(0, 300)}`,
          );
          return [];
        }
        const supaProjects = await res.json();
        return supaProjects.map((sp: any, idx: number) => ({
          id: `supabase:${accIdx}:${idx}`,
          source: "supabase" as const,
          name: sp.name,
          accountLabel:
            acc.label ?? sp.organization_id ?? `supabase-${accIdx + 1}`,
          databaseRef: `supabase:${sp.id}`,
        }));
      } catch (err) {
        console.error(
          `[discover] Supabase fetch threw (account ${accIdx + 1}):`,
          err,
        );
        return [];
      }
    }),
  );
  return results.flat();
}

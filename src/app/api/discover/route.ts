import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeSyncRequest } from "@/lib/cron-auth";
import { reconcile } from "@/lib/reconcile";
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

  const [vercelItems, githubItems, supabaseItems] = await Promise.all([
    fetchVercel(),
    fetchGitHub(),
    fetchSupabase(),
  ]);

  const allItems: DiscoveredItem[] = [
    ...vercelItems,
    ...githubItems,
    ...supabaseItems,
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
      },
      runId: null,
      aiUsed: false,
    });
  }

  const inputHash = hashItems(allItems);

  // Reuse a previous run's decisions if the input set hasn't changed at all
  // — avoids re-billing Grok and guarantees identical output on reruns.
  const existingRun = await prisma.discoverRun.findFirst({
    where: { inputHash },
    orderBy: { createdAt: "desc" },
    include: { decisions: true },
  });

  if (existingRun) {
    const pending = existingRun.decisions.filter((d) => d.status === "pending");
    return NextResponse.json({
      ok: true,
      message: `Discover found the same data as a previous run — reusing its ${pending.length} pending suggestion(s) instead of calling AI again.`,
      sourcesChecked: {
        vercel: vercelItems.length,
        github: githubItems.length,
        supabase: supabaseItems.length,
      },
      runId: existingRun.id,
      aiUsed: existingRun.aiUsed,
      reused: true,
      decisions: enrichDecisions(pending, allItems),
    });
  }

  const result = await reconcile(allItems);

  const run = await prisma.discoverRun.create({
    data: {
      inputHash,
      triggeredBy: auth.actor,
      aiUsed: result.aiUsed,
      raw: JSON.stringify(allItems),
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

  // Standalone items (no cross-source duplicate) never get a "matches" entry
  // from reconcile() since that only groups items of length > 1 — but they
  // still need a decision that actually creates the Project row. Without
  // this, a standalone item could only ever get an assign_branch/field
  // suggestion, both of which require the project to already exist and
  // would fail forever with "apply the match suggestion first." Pushed
  // before branch/field suggestions below so it's always applied first.
  for (const item of result.standalone) {
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

  for (const b of result.branchSuggestions) {
    decisionRows.push({
      runId: run.id,
      action: "assign_branch",
      sourceItemIds: JSON.stringify([b.itemId]),
      suggestion: JSON.stringify({
        suggestedBranchName: b.suggestedBranchName,
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
    ? await prisma.aIDecision.findMany({ where: { runId: run.id } })
    : [];

  return NextResponse.json({
    ok: true,
    message: `Found ${allItems.length} item(s) across sources. ${result.matches.length} match group(s), ${result.branchSuggestions.length} branch suggestion(s), ${result.fieldSuggestions.length} field suggestion(s).${result.aiUsed ? "" : ` (AI not used${result.aiError ? ": " + result.aiError : ""} — deterministic matching only.)`}`,
    sourcesChecked: {
      vercel: vercelItems.length,
      github: githubItems.length,
      supabase: supabaseItems.length,
    },
    runId: run.id,
    aiUsed: result.aiUsed,
    aiError: result.aiError,
    standaloneCount: result.standalone.length,
    // Every standalone item (no cross-source match, no pending decision row)
    // still needs to actually reach the registry — otherwise "Discover" can
    // report "12 items found" while the table below shows nothing new.
    standalone: result.standalone,
    decisions: enrichDecisions(createdDecisions, allItems),
  });
}

// Attaches the resolved DiscoveredItem[] + parsed suggestion to each raw
// AIDecision row so the review UI can render names/urls/branches without a
// second fetch or having to parse the run's stored JSON itself.
function enrichDecisions(
  decisions: {
    id: string;
    action: string;
    sourceItemIds: string;
    suggestion: string;
    reasoning: string | null;
    confidence: number;
    method: string;
  }[],
  items: DiscoveredItem[],
) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return decisions.map((d) => {
    const itemIds: string[] = JSON.parse(d.sourceItemIds);
    return {
      id: d.id,
      action: d.action,
      items: itemIds.map((id) => byId.get(id)).filter(Boolean),
      suggestion: JSON.parse(d.suggestion),
      reasoning: d.reasoning,
      confidence: d.confidence,
      method: d.method,
    };
  });
}

async function fetchVercel(): Promise<DiscoveredItem[]> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return [];
  try {
    const teamQuery = process.env.VERCEL_TEAM_ID
      ? `?teamId=${process.env.VERCEL_TEAM_ID}`
      : "";
    const res = await fetch(`https://api.vercel.com/v9/projects${teamQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[discover] Vercel fetch failed: ${res.status} ${body.slice(0, 300)}`,
      );
      return [];
    }
    const data = await res.json();
    return (data.projects ?? []).map((vp: any, idx: number) => ({
      id: `vercel:${idx}`,
      source: "vercel" as const,
      name: vp.name,
      accountLabel:
        process.env.VERCEL_ACCOUNT_LABEL ?? vp.accountId ?? "vercel-account",
      url: vp.targets?.production?.alias?.[0]
        ? `https://${vp.targets.production.alias[0]}`
        : undefined,
      status: vp.latestDeployments?.[0]?.readyState,
    }));
  } catch (err) {
    console.error(`[discover] Vercel fetch threw:`, err);
    return [];
  }
}

async function fetchGitHub(): Promise<DiscoveredItem[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return [];
  try {
    const org = process.env.GITHUB_ORG;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    };
    let res = await fetch(
      `https://api.github.com/orgs/${org}/repos?per_page=100`,
      { headers, cache: "no-store" },
    );
    if (res.status === 404) {
      // /users/{username}/repos only ever returns that user's PUBLIC repos,
      // regardless of token scope — GitHub's API treats it as "browse this
      // profile", not "show me what I own". If GITHUB_ORG is actually a
      // personal account (the org lookup above 404'd), private repos the
      // token owns would silently never appear. /user/repos uses the
      // token's own identity instead, so private+owned repos are included.
      res = await fetch(
        `https://api.github.com/user/repos?per_page=100&affiliation=owner&visibility=all`,
        { headers, cache: "no-store" },
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[discover] GitHub fetch failed: ${res.status} ${body.slice(0, 300)}`,
      );
      return [];
    }
    const repos = await res.json();
    return repos.map((repo: any, idx: number) => ({
      id: `github:${idx}`,
      source: "github" as const,
      name: repo.name,
      accountLabel: org ?? "github-org",
      url: repo.html_url,
      description: repo.description ?? undefined,
      language: repo.language ?? undefined,
    }));
  } catch (err) {
    console.error(`[discover] GitHub fetch threw:`, err);
    return [];
  }
}

async function fetchSupabase(): Promise<DiscoveredItem[]> {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[discover] Supabase fetch failed: ${res.status} ${body.slice(0, 300)}`,
      );
      return [];
    }
    const supaProjects = await res.json();
    return supaProjects.map((sp: any, idx: number) => ({
      id: `supabase:${idx}`,
      source: "supabase" as const,
      name: sp.name,
      accountLabel: sp.organization_id ?? "supabase-org",
      databaseRef: `supabase:${sp.id}`,
    }));
  } catch (err) {
    console.error(`[discover] Supabase fetch threw:`, err);
    return [];
  }
}

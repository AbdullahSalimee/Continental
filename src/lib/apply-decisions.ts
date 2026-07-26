import { prisma } from "@/lib/prisma";
import { upsertProjectFromSync } from "@/lib/store";
import { extractDomainUrl } from "@/lib/extract-domain-url";
import type { DiscoveredItem } from "@/lib/discover-types";

// Applies a set of pending AIDecision rows -- shared by the manual
// /api/discover/apply endpoint (human clicks Approve) and the fully
// automated path in /api/discover (system applies immediately, no review).
// Order matters: decisions are always processed createdAt asc, since a
// match/attach_existing decision must land before any assign_branch or
// suggest_status/description decision for the same item.
export async function applyDecisionIds(decisionIds: string[]) {
  const decisions = await prisma.aIDecision.findMany({
    where: { id: { in: decisionIds }, status: "pending" },
    include: { run: true },
    orderBy: { createdAt: "asc" },
  });

  if (decisions.length === 0) {
    return { applied: 0, errors: [] as string[], rejected: [] as string[] };
  }

  const unassigned = await prisma.domain.findFirst({
    where: { name: "Unassigned" },
  });

  let applied = 0;
  const errors: string[] = [];
  const rejected: string[] = [];

  // Safety floor for AI-proposed multi-item merges. Deterministic matches
  // (exact/fuzzy) are exempt -- they're proven safe by the clique-based
  // clustering fix in fuzzy-match.ts, which requires every cluster member
  // to mutually resemble every other, not just share a keyword. AI matches
  // are a different risk: the model can propose a merge based on weak
  // co-occurrence ("both mention KDH in their description") that isn't
  // caught by any string-similarity check. Since there's no human review
  // step before this applies, a below-floor AI match is rejected outright
  // rather than trusted -- the prompt in reconcile.ts now explicitly tells
  // the model not to do this, but this is the backstop in case it still
  // does. A single-item AI match (attaching one new item into an existing
  // project via a domain/status suggestion, not a cross-source identity
  // merge) is unaffected -- this floor only applies to MERGING 2+ raw items
  // into one project, which is the operation that can wrongly combine two
  // real, distinct projects.
  const AI_MATCH_CONFIDENCE_FLOOR = 0.75;

  // Second, independent check: catches the case a confidence floor alone
  // can't -- the AI being confidently wrong, not uncertain. Real example
  // from testing: "kdh" + "Meher" merged at confidence 0.80 with reasoning
  // "Both projects mention 'kdh' in their name or description" -- a high
  // confidence score attached to reasoning that is, on its face, a
  // domain-co-occurrence argument, not an identity argument. Rather than
  // trust the number, this scans the model's OWN reasoning text for the
  // literal pattern of that mistake and rejects regardless of confidence.
  // Not exhaustive (a model could describe the same bad logic in wording
  // this doesn't catch), but it directly closes the exact failure observed.
  const domainNames = (
    await prisma.domain.findMany({ select: { name: true } })
  ).map((d) => d.name);

  // Third, structural safety layer -- independent of exact phrasing. If the
  // AI's own reasoning for a MATCH (identity claim) literally names one of
  // the company's real domains/branches as its justification (e.g. "Both
  // are Remakes Labs related", "part of KDH"), that is definitionally a
  // domain-assignment argument, not a same-product argument, regardless of
  // how it's worded. This generalizes better than the regex patterns below,
  // which only catch phrasings we've already seen go wrong.
  function reasoningNamesADomain(reasoning: string | null): string | null {
    if (!reasoning) return null;
    for (const d of domainNames) {
      if (d.length >= 3 && reasoning.toLowerCase().includes(d.toLowerCase())) {
        return d;
      }
    }
    return null;
  }

  const DOMAIN_CONFLATION_PATTERNS = [
    /both.{0,40}mention/i,
    /both.{0,40}(project|item)s?.{0,30}(mention|contain|include|reference)/i,
    /similar names and .{0,30}(context|related)/i,
    /same (domain|business|company|client)/i, // domain-level similarity, not identity
    /both.{0,10}(are|is).{0,30}(related|associated|part of|belong)/i, // "both are Remakes Labs related"
    /(part of|belong(s)? to|under) the same/i,
    /share (the|a) (domain|business|brand|company)/i,
  ];
  function reasoningShowsDomainConflation(reasoning: string | null): boolean {
    if (!reasoning) return false;
    return DOMAIN_CONFLATION_PATTERNS.some((p) => p.test(reasoning));
  }

  for (const decision of decisions) {
    const itemCount =
      decision.action === "match"
        ? JSON.parse(decision.sourceItemIds).length
        : 0;
    const isMultiItemAIMatch =
      decision.action === "match" && decision.method === "ai" && itemCount > 1;

    const namedDomain = isMultiItemAIMatch
      ? reasoningNamesADomain(decision.reasoning)
      : null;

    if (
      isMultiItemAIMatch &&
      (decision.confidence < AI_MATCH_CONFIDENCE_FLOOR ||
        reasoningShowsDomainConflation(decision.reasoning) ||
        namedDomain)
    ) {
      await prisma.aIDecision.update({
        where: { id: decision.id },
        data: { status: "rejected" },
      });
      const reason =
        decision.confidence < AI_MATCH_CONFIDENCE_FLOOR
          ? `confidence ${decision.confidence} below safety floor (${AI_MATCH_CONFIDENCE_FLOOR})`
          : namedDomain
            ? `reasoning names the domain "${namedDomain}" as justification -- that's a domain-assignment argument, not a same-product argument`
            : "reasoning pattern matches known domain-vs-identity conflation bug";
      rejected.push(
        `Decision ${decision.id}: AI match rejected -- ${reason}. Reasoning was: "${decision.reasoning ?? "(none)"}"`,
      );
      continue;
    }
    try {
      const rawItems: DiscoveredItem[] = JSON.parse(decision.run.raw);
      const itemIds: string[] = JSON.parse(decision.sourceItemIds);
      const suggestion = JSON.parse(decision.suggestion);
      const items = itemIds
        .map((id) => rawItems.find((r) => r.id === id))
        .filter((x): x is DiscoveredItem => Boolean(x));

      if (items.length === 0) {
        errors.push(`Decision ${decision.id}: source items no longer found.`);
        continue;
      }

      if (decision.action === "match") {
        const primary = items[0];
        const domainMatchSignal = firstDefined(
          items.map((i) =>
            [i.description, i.language].filter(Boolean).join(" "),
          ),
        );
        const projectId = await upsertProjectFromSync({
          name: suggestion.suggestedName ?? primary.name,
          domainId: unassigned?.id ?? "",
          status: firstDefined(items.map((i) => statusFrom(i.status))),
          liveUrl: firstDefined(
            items.filter((i) => i.source !== "github").map((i) => i.url),
          ),
          repoUrl: firstDefined(
            items.filter((i) => i.source === "github").map((i) => i.url),
          ),
          databaseRef: firstDefined(items.map((i) => i.databaseRef)),
          hostingPlatform:
            [
              items.some((i) => i.source === "vercel") ? "vercel" : null,
              items.some((i) => i.source === "netlify") ? "netlify" : null,
            ]
              .filter(Boolean)
              .join(",") || undefined,
          platform: primary.source,
          syncSource: "ai_discover",
          accountLabel: primary.accountLabel,
          domainMatchSignal,
          sourceDescription: primary.description,
        });

        // Every item in the matched group gets its own ProjectSource row --
        // upsertProjectFromSync above only wrote one (for `primary`), so a
        // group of e.g. Vercel + Netlify + GitHub items needs the other two
        // written here too. This is what lets the project page show 2
        // deployment regions instead of 1.
        for (const item of items) {
          if (item.id === primary.id) continue;
          await prisma.projectSource.upsert({
            where: {
              projectId_platform_accountLabel: {
                projectId,
                platform: item.source,
                accountLabel: item.accountLabel,
              },
            },
            update: {
              url: item.url,
              status: item.status,
              description: item.description,
              databaseRef: item.databaseRef,
              lastSeenAt: new Date(),
            },
            create: {
              projectId,
              platform: item.source,
              accountLabel: item.accountLabel,
              url: item.url,
              status: item.status,
              description: item.description,
              databaseRef: item.databaseRef,
            },
          });
        }

        const canonicalKey = (suggestion.suggestedName ?? primary.name)
          .trim()
          .toLowerCase();
        const namesInGroup = new Set(
          items.map((i) => i.name.trim().toLowerCase()),
        );
        namesInGroup.delete(canonicalKey);
        if (namesInGroup.size > 0) {
          const duplicates = await prisma.project.findMany({
            where: { id: { not: projectId } },
          });
          const toFold = duplicates.filter((d) =>
            namesInGroup.has(d.name.trim().toLowerCase()),
          );
          for (const dup of toFold) {
            await prisma.syncStamp.updateMany({
              where: { projectId: dup.id },
              data: { projectId },
            });
            await prisma.inboxAccount.updateMany({
              where: { linkedProjectId: dup.id },
              data: { linkedProjectId: projectId },
            });
            await prisma.aIDecision.updateMany({
              where: { targetProjectId: dup.id },
              data: { targetProjectId: projectId },
            });
            await prisma.project.delete({ where: { id: dup.id } });
          }
        }

        await prisma.aIDecision.update({
          where: { id: decision.id },
          data: { status: "accepted", targetProjectId: projectId },
        });
        applied++;
        continue;
      }

      if (decision.action === "attach_existing") {
        const target = await prisma.project.findUnique({
          where: { id: suggestion.existingProjectId },
        });
        if (!target) {
          errors.push(
            `Decision ${decision.id}: existing project "${suggestion.existingProjectName}" no longer found.`,
          );
          continue;
        }
        const item = items[0];
        await prisma.project.update({
          where: { id: target.id },
          data: {
            lastKnownUpdateAt: new Date(),
            ...(item.source === "netlify" &&
            !target.hostingPlatform?.includes("netlify")
              ? {
                  hostingPlatform: [target.hostingPlatform, "netlify"]
                    .filter(Boolean)
                    .join(","),
                }
              : {}),
            ...(item.source === "vercel" &&
            !target.hostingPlatform?.includes("vercel")
              ? {
                  hostingPlatform: [target.hostingPlatform, "vercel"]
                    .filter(Boolean)
                    .join(","),
                }
              : {}),
            ...(item.source === "github" && item.url
              ? { repoUrl: item.url }
              : {}),
            ...(item.databaseRef ? { databaseRef: item.databaseRef } : {}),
          },
        });

        // This is the real fix for "attaching a new account's project to an
        // existing one doesn't add its own fields" -- the update above only
        // touches the fixed Project columns; this writes/refreshes the
        // per-platform row so this account's own url/status is kept
        // separately from any other platform already attached.
        await prisma.projectSource.upsert({
          where: {
            projectId_platform_accountLabel: {
              projectId: target.id,
              platform: item.source,
              accountLabel: item.accountLabel,
            },
          },
          update: {
            url: item.url,
            status: item.status,
            description: item.description,
            databaseRef: item.databaseRef,
            lastSeenAt: new Date(),
          },
          create: {
            projectId: target.id,
            platform: item.source,
            accountLabel: item.accountLabel,
            url: item.url,
            status: item.status,
            description: item.description,
            databaseRef: item.databaseRef,
          },
        });

        const existingStamp = await prisma.syncStamp.findFirst({
          where: {
            projectId: target.id,
            source: item.source,
            accountLabel: item.accountLabel,
          },
        });
        if (existingStamp) {
          await prisma.syncStamp.update({
            where: { id: existingStamp.id },
            data: { lastSeenAt: new Date(), reachable: true },
          });
        } else {
          await prisma.syncStamp.create({
            data: {
              projectId: target.id,
              source: item.source,
              accountLabel: item.accountLabel,
              lastSeenAt: new Date(),
              reachable: true,
            },
          });
        }
        await prisma.aIDecision.update({
          where: { id: decision.id },
          data: { status: "accepted", targetProjectId: target.id },
        });
        applied++;
        continue;
      }

      if (decision.action === "assign_branch") {
        const domain = await prisma.domain.findFirst({
          where: { name: suggestion.suggestedBranchName },
        });
        if (!domain) {
          errors.push(
            `Decision ${decision.id}: domain "${suggestion.suggestedBranchName}" not found.`,
          );
          continue;
        }
        const item = items[0];
        const existing = await resolveProjectForItem(item, decision.runId);
        if (existing) {
          await prisma.project.update({
            where: { id: existing.id },
            data: { domainId: domain.id },
          });
          await prisma.aIDecision.update({
            where: { id: decision.id },
            data: { status: "accepted", targetProjectId: existing.id },
          });
          applied++;
        } else {
          errors.push(
            `Decision ${decision.id}: no existing project named "${item.name}" to reassign -- apply the match suggestion first.`,
          );
        }
        continue;
      }

      if (
        decision.action === "suggest_status" ||
        decision.action === "suggest_description"
      ) {
        const item = items[0];
        const existing = await resolveProjectForItem(item, decision.runId);
        if (existing) {
          await prisma.project.update({
            where: { id: existing.id },
            data: {
              status: suggestion.suggestedStatus ?? existing.status,
              notes: suggestion.suggestedDescription ?? existing.notes,
            },
          });
          await prisma.aIDecision.update({
            where: { id: decision.id },
            data: { status: "accepted", targetProjectId: existing.id },
          });
          applied++;
        } else {
          errors.push(
            `Decision ${decision.id}: no existing project named "${item.name}" to update.`,
          );
        }
        continue;
      }
    } catch (err) {
      errors.push(`Decision ${decision.id}: ${(err as Error).message}`);
    }
  }

  return { applied, errors, rejected };
}

async function resolveProjectForItem(item: DiscoveredItem, runId: string) {
  const siblingDecisions = await prisma.aIDecision.findMany({
    where: {
      runId,
      action: { in: ["match", "attach_existing"] },
      status: "accepted",
    },
  });
  for (const m of siblingDecisions) {
    const ids: string[] = JSON.parse(m.sourceItemIds);
    if (ids.includes(item.id) && m.targetProjectId) {
      const byId = await prisma.project.findUnique({
        where: { id: m.targetProjectId },
      });
      if (byId) return byId;
    }
  }
  return prisma.project.findFirst({ where: { name: { equals: item.name } } });
}

function statusFrom(vercelReadyState: string | undefined): string | undefined {
  switch (vercelReadyState) {
    case "READY":
      return "live";
    case "ERROR":
    case "CANCELED":
      return "broken";
    case "BUILDING":
    case "INITIALIZING":
    case "QUEUED":
      return "in_development";
    default:
      return undefined;
  }
}

function firstDefined<T>(values: (T | undefined)[]): T | undefined {
  return values.find((v) => v !== undefined && v !== null && v !== "");
}

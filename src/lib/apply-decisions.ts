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
    return { applied: 0, errors: [] as string[] };
  }

  const unassigned = await prisma.domain.findFirst({
    where: { name: "Unassigned" },
  });

  let applied = 0;
  const errors: string[] = [];

  for (const decision of decisions) {
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

  return { applied, errors };
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

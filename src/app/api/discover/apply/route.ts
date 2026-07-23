import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorizeSyncRequest } from "@/lib/cron-auth";
import { upsertProjectFromSync } from "@/lib/store";
import type { DiscoveredItem } from "@/lib/discover-types";

// This is the ONLY route that lets a Discover suggestion actually touch the
// Project table. It requires an explicit list of decisionIds the caller
// (the review UI) says the human approved — nothing is applied implicitly,
// and nothing here re-runs AI.
export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const decisionIds: string[] = body?.decisionIds ?? [];
  if (!Array.isArray(decisionIds) || decisionIds.length === 0) {
    return NextResponse.json(
      { ok: false, message: "decisionIds (non-empty array) is required." },
      { status: 400 },
    );
  }

  // Order matters: a standalone/match decision must be applied before any
  // assign_branch or suggest_status/description decision for the same item,
  // since those only update a project that already exists. createdAt asc
  // mirrors the insertion order in /api/discover (matches first, then
  // branch/field suggestions), so applying "all" in one call is safe even
  // though the caller may pass decisionIds in any order.
  const decisions = await prisma.aIDecision.findMany({
    where: { id: { in: decisionIds }, status: "pending" },
    include: { run: true },
    orderBy: { createdAt: "asc" },
  });

  if (decisions.length === 0) {
    return NextResponse.json({
      ok: true,
      message:
        "No pending decisions matched the given ids (already applied or rejected?).",
      applied: 0,
    });
  }

  const unassigned = await prisma.branch.findFirst({
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
        // Create/update one Project representing the merged group, using the
        // richest available data across the matched items (first non-empty
        // wins per field), then a SyncStamp per source item.
        const primary = items[0];
        const projectId = await upsertProjectFromSync({
          name: suggestion.suggestedName ?? primary.name,
          branchId: unassigned?.id ?? "",
          status: firstDefined(items.map((i) => statusFrom(i.status))),
          liveUrl: firstDefined(
            items.filter((i) => i.source !== "github").map((i) => i.url),
          ),
          repoUrl: firstDefined(
            items.filter((i) => i.source === "github").map((i) => i.url),
          ),
          databaseRef: firstDefined(items.map((i) => i.databaseRef)),
          hostingPlatform: items.some((i) => i.source === "vercel")
            ? "vercel"
            : undefined,
          syncSource: "ai_discover",
          accountLabel: primary.accountLabel,
        });

        await prisma.aIDecision.update({
          where: { id: decision.id },
          data: { status: "accepted", targetProjectId: projectId },
        });
        applied++;
        continue;
      }

      if (decision.action === "assign_branch") {
        const branch = await prisma.branch.findFirst({
          where: { name: suggestion.suggestedBranchName },
        });
        if (!branch) {
          errors.push(
            `Decision ${decision.id}: branch "${suggestion.suggestedBranchName}" not found.`,
          );
          continue;
        }
        const item = items[0];
        const existing = await resolveProjectForItem(item, decision.runId);
        if (existing) {
          await prisma.project.update({
            where: { id: existing.id },
            data: { branchId: branch.id },
          });
          await prisma.aIDecision.update({
            where: { id: decision.id },
            data: { status: "accepted", targetProjectId: existing.id },
          });
          applied++;
        } else {
          errors.push(
            `Decision ${decision.id}: no existing project named "${item.name}" to reassign — apply the match suggestion first.`,
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

  if (applied > 0) {
    // So the Project Registry table (and branch dashboards, which read the
    // same data) show newly-applied projects immediately even if the caller
    // navigates via a server-rendered link rather than the client's own refresh.
    revalidatePath("/", "layout");
  }

  return NextResponse.json({
    ok: errors.length === 0,
    message: `Applied ${applied} of ${decisions.length} decision(s)${errors.length ? `, ${errors.length} error(s)` : ""} (by ${auth.actor}).`,
    applied,
    errors,
  });
}

// Rejects decisions without applying them — for the "discard" side of review.
export async function DELETE(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const decisionIds: string[] = body?.decisionIds ?? [];
  if (!Array.isArray(decisionIds) || decisionIds.length === 0) {
    return NextResponse.json(
      { ok: false, message: "decisionIds (non-empty array) is required." },
      { status: 400 },
    );
  }

  const result = await prisma.aIDecision.updateMany({
    where: { id: { in: decisionIds }, status: "pending" },
    data: { status: "rejected" },
  });

  return NextResponse.json({
    ok: true,
    message: `Rejected ${result.count} decision(s).`,
    rejected: result.count,
  });
}

// A branch/status/description suggestion targets a single source item, but
// the project it belongs to may have been created under a different
// *merged* canonical name (e.g. Vercel's "taste" + GitHub's "taste-app" ->
// project named "Taste"). Prefer the accepted "match" decision from the
// same run that included this item — it recorded the real targetProjectId
// — before falling back to a plain name lookup for the simple/standalone case.
async function resolveProjectForItem(item: DiscoveredItem, runId: string) {
  const siblingMatches = await prisma.aIDecision.findMany({
    where: { runId, action: "match", status: "accepted" },
  });
  for (const m of siblingMatches) {
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

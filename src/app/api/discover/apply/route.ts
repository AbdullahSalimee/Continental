import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorizeSyncRequest } from "@/lib/cron-auth";
import { applyDecisionIds } from "@/lib/apply-decisions";

// This is the ONLY route that lets a Discover suggestion actually touch the
// Project table via a manual approval click. (Full-auto mode applies
// decisions itself via the same applyDecisionIds() from /api/discover.)
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

  const { applied, errors } = await applyDecisionIds(decisionIds);

  if (applied === 0 && errors.length === 0) {
    return NextResponse.json({
      ok: true,
      message:
        "No pending decisions matched the given ids (already applied or rejected?).",
      applied: 0,
    });
  }

  if (applied > 0) {
    revalidatePath("/", "layout");
  }

  return NextResponse.json({
    ok: errors.length === 0,
    message: `Applied ${applied} decision(s)${errors.length ? `, ${errors.length} error(s)` : ""} (by ${auth.actor}).`,
    applied,
    errors,
  });
}

// Rejects decisions without applying them -- kept for cases where auto-apply
// is off or a specific decision needs to be discarded via the API directly.
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

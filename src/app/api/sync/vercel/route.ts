import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertProjectFromSync } from "@/lib/store";
import { authorizeSyncRequest } from "@/lib/cron-auth";

// Production wiring: set VERCEL_API_TOKEN (+ optional VERCEL_TEAM_ID,
// VERCEL_ACCOUNT_LABEL). For multiple connected Vercel accounts, extend
// this to loop over a stored list of { label, token } pairs instead of a
// single env var — the schema (ExternalAccount) already supports many.
// Runs on-demand (button in the UI, superadmin session) and on a schedule
// (see vercel.json crons + CRON_SECRET, checked in authorizeSyncRequest).

// Vercel's deployment readyState -> our internal project status vocabulary.
// See https://vercel.com/docs/deployments/deployment-states
function statusFromReadyState(readyState: string | undefined): string {
  switch (readyState) {
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
      return "unknown";
  }
}

export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok)
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );

  const token = process.env.VERCEL_API_TOKEN;

  if (!token) {
    const stamps = await prisma.syncStamp.findMany({
      where: { source: "vercel_api" },
    });
    await Promise.all(
      stamps.map((s) =>
        prisma.syncStamp.update({
          where: { id: s.id },
          data: { lastSeenAt: new Date() },
        }),
      ),
    );
    return NextResponse.json({
      ok: true,
      configured: false,
      message: `No VERCEL_API_TOKEN configured — simulated refresh of ${stamps.length} previously-synced project(s) (triggered by ${auth.actor}). Add a token in env to sync a real account.`,
      discovered: [],
    });
  }

  try {
    const teamQuery = process.env.VERCEL_TEAM_ID
      ? `?teamId=${process.env.VERCEL_TEAM_ID}`
      : "";
    const res = await fetch(`https://api.vercel.com/v9/projects${teamQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Vercel API responded ${res.status}`);
    const data = await res.json();

    const unassigned = await prisma.branch.findFirst({
      where: { name: "Unassigned" },
    });
    const discovered: { name: string; status: string; accountLabel: string }[] =
      [];

    // Bring in ALL projects, regardless of deployment state — the whole point
    // of this feed is visibility into broken/building projects, not just live ones.
    for (const vp of data.projects ?? []) {
      const latestDeployment = vp.latestDeployments?.[0];
      const readyState: string | undefined = latestDeployment?.readyState;
      const status = statusFromReadyState(readyState);
      const accountLabel =
        process.env.VERCEL_ACCOUNT_LABEL ??
        vp.accountId ??
        "connected-vercel-account";

      await upsertProjectFromSync({
        name: vp.name,
        branchId: unassigned?.id ?? "",
        hostingPlatform: "vercel",
        status,
        liveUrl: vp.targets?.production?.alias?.[0]
          ? `https://${vp.targets.production.alias[0]}`
          : undefined,
        syncSource: "vercel_api",
        accountLabel,
      });
      discovered.push({ name: vp.name, status, accountLabel });
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      message: `Found ${discovered.length} project(s) on Vercel (triggered by ${auth.actor}).`,
      discovered,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message: `Vercel sync failed: ${(err as Error).message}`,
        discovered: [],
      },
      { status: 502 },
    );
  }
}

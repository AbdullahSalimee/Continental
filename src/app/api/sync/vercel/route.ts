import { NextResponse } from "next/server";
import { projects, upsertProjectFromSync } from "@/lib/store";

// ─────────────────────────────────────────────────────────────────────────
// Module A automation: Vercel sync.
//
// Production wiring (not enabled in this scaffold — no live account is
// connected): set VERCEL_API_TOKEN (and optionally VERCEL_TEAM_ID) as env
// vars, then this route calls Vercel's REST API to list every project
// under the connected account and upserts it into the registry.
//
//   GET https://api.vercel.com/v9/projects
//   Headers: Authorization: Bearer <VERCEL_API_TOKEN>
//
// For multiple connected Vercel accounts (the PRD explicitly requires
// supporting more than one, since account sprawl is one of the root
// problems), store an array of { label, token } pairs — e.g. in a
// `hosting_accounts` table — and loop over them here, tagging each synced
// project with which account it came from (see SyncStamp.accountLabel).
//
// This route is meant to be called both on a schedule (a cron / queue
// trigger hitting this same handler) and on-demand (the "sync vercel"
// button in the Project Registry UI), per the PRD's requirement for both.
// ─────────────────────────────────────────────────────────────────────────

export async function POST() {
  const token = process.env.VERCEL_API_TOKEN;

  if (!token) {
    // No account connected yet in this environment. We still "touch" the
    // sync stamps of projects that were previously synced from Vercel, so
    // the UI can demonstrate what a completed sync looks like end-to-end.
    let touched = 0;
    for (const p of projects) {
      const stamp = p.syncHistory.find((s) => s.source === "vercel_api");
      if (stamp) {
        stamp.lastSeenAt = new Date().toISOString();
        touched++;
      }
    }
    return NextResponse.json({
      ok: true,
      configured: false,
      message: `No VERCEL_API_TOKEN configured — simulated refresh of ${touched} previously-synced project(s). Add a token in project settings to sync a real account.`,
    });
  }

  try {
    const teamQuery = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
    const res = await fetch(`https://api.vercel.com/v9/projects${teamQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Vercel API responded ${res.status}`);
    const data = await res.json();

    let created = 0;
    for (const vp of data.projects ?? []) {
      upsertProjectFromSync({
        name: vp.name,
        branchId: "branch_unassigned", // requires a human to file it under a branch — see PRD note on manual/light-touch fields
        hostingPlatform: "vercel",
        hostingAccountLabel: process.env.VERCEL_ACCOUNT_LABEL ?? "connected-vercel-account",
        status: "live",
        liveUrl: vp.targets?.production?.alias?.[0] ? `https://${vp.targets.production.alias[0]}` : undefined,
        syncHistory: [{ source: "vercel_api", accountLabel: process.env.VERCEL_ACCOUNT_LABEL ?? "connected-vercel-account", lastSeenAt: new Date().toISOString(), reachable: true }],
      });
      created++;
    }
    return NextResponse.json({ ok: true, configured: true, message: `Synced ${created} project(s) from Vercel.` });
  } catch (err) {
    return NextResponse.json(
      { ok: false, configured: true, message: `Vercel sync failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";

// Vercel Cron (see vercel.json) calls this on a schedule with an
// Authorization: Bearer <CRON_SECRET> header. This satisfies the PRD's
// "both scheduled and on-demand" sync requirement — the on-demand path is
// the buttons in the Project Registry / Inbox UI, calling the same
// underlying routes with a superadmin session instead of the cron secret.

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const { origin } = new URL(req.url);
  const targets = ["vercel", "github", "supabase", "gmail"];
  const results: Record<string, unknown> = {};

  for (const t of targets) {
    try {
      const res = await fetch(`${origin}/api/sync/${t}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      results[t] = await res.json();
    } catch (err) {
      results[t] = { ok: false, message: (err as Error).message };
    }
  }

  return NextResponse.json({ ok: true, results });
}

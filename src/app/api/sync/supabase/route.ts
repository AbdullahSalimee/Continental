import { NextResponse } from "next/server";
import { projects } from "@/lib/store";

// Production wiring: set SUPABASE_MANAGEMENT_TOKEN (a personal/organization
// access token from Supabase's Management API, distinct from any project's
// anon/service keys). Call:
//   GET https://api.supabase.com/v1/projects
// and match on project name/ref, storing the ref in `databaseRef`
// (e.g. "supabase:my-project-ref"). For multiple connected Supabase accounts,
// loop over a stored list of tokens the same way as the Vercel route.

export async function POST() {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;

  if (!token) {
    let touched = 0;
    for (const p of projects) {
      const stamp = p.syncHistory.find((s) => s.source === "supabase_api");
      if (stamp) {
        stamp.lastSeenAt = new Date().toISOString();
        touched++;
      }
    }
    return NextResponse.json({
      ok: true,
      configured: false,
      message: `No SUPABASE_MANAGEMENT_TOKEN configured — simulated refresh of ${touched} previously-linked database(s). Add a token to sync a real account.`,
    });
  }

  try {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase API responded ${res.status}`);
    const supaProjects = await res.json();

    let matched = 0;
    for (const sp of supaProjects) {
      const project = projects.find((p) => p.name.toLowerCase() === sp.name.toLowerCase());
      if (project) {
        project.databaseRef = `supabase:${sp.id}`;
        matched++;
      }
    }
    return NextResponse.json({ ok: true, configured: true, message: `Matched ${matched} Supabase project(s) to the registry.` });
  } catch (err) {
    return NextResponse.json({ ok: false, configured: true, message: `Supabase sync failed: ${(err as Error).message}` }, { status: 502 });
  }
}

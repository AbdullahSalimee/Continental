import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeSyncRequest } from "@/lib/cron-auth";

export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;

  if (!token) {
    const stamps = await prisma.syncStamp.findMany({ where: { source: "supabase_api" } });
    await Promise.all(stamps.map((s) => prisma.syncStamp.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } })));
    return NextResponse.json({
      ok: true,
      configured: false,
      message: `No SUPABASE_MANAGEMENT_TOKEN configured — simulated refresh of ${stamps.length} previously-linked database(s) (triggered by ${auth.actor}).`,
    });
  }

  try {
    const res = await fetch("https://api.supabase.com/v1/projects", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Supabase API responded ${res.status}`);
    const supaProjects = await res.json();

    let matched = 0;
    for (const sp of supaProjects) {
      const project = await prisma.project.findFirst({ where: { name: { equals: sp.name } } });
      if (project) {
        await prisma.project.update({ where: { id: project.id }, data: { databaseRef: `supabase:${sp.id}` } });
        matched++;
      }
    }
    return NextResponse.json({ ok: true, configured: true, message: `Matched ${matched} Supabase project(s) to the registry (triggered by ${auth.actor}).` });
  } catch (err) {
    return NextResponse.json({ ok: false, configured: true, message: `Supabase sync failed: ${(err as Error).message}` }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertProjectFromSync } from "@/lib/store";
import { authorizeSyncRequest } from "@/lib/cron-auth";

export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok)
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );

  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;

  if (!token) {
    const stamps = await prisma.syncStamp.findMany({
      where: { source: "supabase_api" },
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
      message: `No SUPABASE_MANAGEMENT_TOKEN configured — simulated refresh of ${stamps.length} previously-linked database(s) (triggered by ${auth.actor}).`,
      discovered: [],
    });
  }

  try {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase API responded ${res.status}`);
    const supaProjects = await res.json();

    const unassigned = await prisma.domain.findFirst({
      where: { name: "Unassigned" },
    });
    let matched = 0;
    let created = 0;
    const discovered: {
      name: string;
      databaseRef: string;
      organizationId: string;
      matchedExisting: boolean;
    }[] = [];

    // FIX: previously this only matched by exact name against existing
    // projects — a Supabase project with no name-matching registry entry was
    // silently dropped, and no SyncStamp was ever written (so it never even
    // showed up as "seen"). Now every Supabase project goes through
    // upsertProjectFromSync like Vercel/GitHub, so nothing is lost.
    for (const sp of supaProjects) {
      const existingBefore = await prisma.project.findFirst({
        where: { name: { equals: sp.name } },
      });
      const isNew = !existingBefore;
      const accountLabel = sp.organization_id ?? "supabase-org";

      await upsertProjectFromSync({
        name: sp.name,
        domainId: unassigned?.id ?? "",
        syncSource: "supabase_api",
        accountLabel,
        databaseRef: `supabase:${sp.id}`,
      });

      if (isNew) created++;
      else matched++;
      discovered.push({
        name: sp.name,
        databaseRef: sp.id,
        organizationId: accountLabel,
        matchedExisting: !isNew,
      });
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      message: `Found ${supaProjects.length} Supabase project(s) (triggered by ${auth.actor}): ${matched} matched existing registry entries, ${created} newly created into Unassigned domain.`,
      discovered,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message: `Supabase sync failed: ${(err as Error).message}`,
        discovered: [],
      },
      { status: 502 },
    );
  }
}

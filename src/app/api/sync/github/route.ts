import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeSyncRequest } from "@/lib/cron-auth";

export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    const stamps = await prisma.syncStamp.findMany({ where: { source: "github_api" } });
    await Promise.all(stamps.map((s) => prisma.syncStamp.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } })));
    return NextResponse.json({
      ok: true,
      configured: false,
      message: `No GITHUB_TOKEN configured — simulated refresh of ${stamps.length} previously-linked repo(s) (triggered by ${auth.actor}).`,
    });
  }

  try {
    const org = process.env.GITHUB_ORG;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    };

    let res = await fetch(
      `https://api.github.com/orgs/${org}/repos?per_page=100`,
      {
        headers,
        cache: "no-store",
      },
    );

    // If it's not an organization, try it as a user
    if (res.status === 404) {
      res = await fetch(
        `https://api.github.com/users/${org}/repos?per_page=100`,
        {
          headers,
          cache: "no-store",
        },
      );
    }

    if (!res.ok) {
      throw new Error(`GitHub API responded ${res.status}`);
    }

    const repos = await res.json();

    let matched = 0;
    for (const repo of repos) {
      const project = await prisma.project.findFirst({ where: { name: { equals: repo.name } } });
      if (project) {
        await prisma.project.update({ where: { id: project.id }, data: { repoUrl: repo.html_url } });
        const stamp = await prisma.syncStamp.findFirst({ where: { projectId: project.id, source: "github_api" } });
        if (stamp) await prisma.syncStamp.update({ where: { id: stamp.id }, data: { lastSeenAt: new Date(), reachable: true } });
        else await prisma.syncStamp.create({ data: { projectId: project.id, source: "github_api", accountLabel: org ?? "github-org", lastSeenAt: new Date(), reachable: true } });
        matched++;
      }
    }
    return NextResponse.json({ ok: true, configured: true, message: `Matched ${matched} repo(s) to existing registry entries (triggered by ${auth.actor}).` });
  } catch (err) {
    return NextResponse.json({ ok: false, configured: true, message: `GitHub sync failed: ${(err as Error).message}` }, { status: 502 });
  }
}

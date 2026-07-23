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

  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    const stamps = await prisma.syncStamp.findMany({
      where: { source: "github_api" },
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
      message: `No GITHUB_TOKEN configured — simulated refresh of ${stamps.length} previously-linked repo(s) (triggered by ${auth.actor}).`,
      discovered: [],
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

    // If it's not an organization, try it as the token's own account —
    // /users/{name}/repos only returns PUBLIC repos no matter the token's
    // scope, so a private repo like this one would silently never sync.
    // /user/repos uses the token's identity and includes owned private repos.
    if (res.status === 404) {
      res = await fetch(
        `https://api.github.com/user/repos?per_page=100&affiliation=owner&visibility=all`,
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

    const unassigned = await prisma.branch.findFirst({
      where: { name: "Unassigned" },
    });
    let matched = 0;
    let created = 0;
    const discovered: {
      name: string;
      repoUrl: string;
      matchedExisting: boolean;
    }[] = [];

    // FIX: previously this only matched repos to already-existing projects by
    // exact name, so a repo with no matching project (e.g. name differs from
    // its Vercel project name) was silently skipped. Now every repo gets a
    // project via upsertProjectFromSync — same as Vercel/Supabase sync — so
    // nothing discoverable is ever dropped on the floor.
    for (const repo of repos) {
      const existingBefore = await prisma.project.findFirst({
        where: { name: { equals: repo.name } },
      });
      const isNew = !existingBefore;

      await upsertProjectFromSync({
        name: repo.name,
        branchId: unassigned?.id ?? "",
        syncSource: "github_api",
        accountLabel: org ?? "github-org",
        repoUrl: repo.html_url,
      });

      if (isNew) created++;
      else matched++;
      discovered.push({
        name: repo.name,
        repoUrl: repo.html_url,
        matchedExisting: !isNew,
      });
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      message: `Found ${repos.length} repo(s) on GitHub (triggered by ${auth.actor}): ${matched} matched existing projects, ${created} newly created into Unassigned.`,
      discovered,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message: `GitHub sync failed: ${(err as Error).message}`,
        discovered: [],
      },
      { status: 502 },
    );
  }
}

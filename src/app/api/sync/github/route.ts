import { NextResponse } from "next/server";
import { projects } from "@/lib/store";

// Production wiring: set GITHUB_TOKEN (+ GITHUB_ORG or a list of orgs/users
// for multiple connected accounts). Call:
//   GET https://api.github.com/orgs/<org>/repos
// and match repos to existing registry entries by name (or let a human
// link them once, then keep matching on repoUrl going forward).

export async function POST() {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    let touched = 0;
    for (const p of projects) {
      const stamp = p.syncHistory.find((s) => s.source === "github_api");
      if (stamp) {
        stamp.lastSeenAt = new Date().toISOString();
        touched++;
      }
    }
    return NextResponse.json({
      ok: true,
      configured: false,
      message: `No GITHUB_TOKEN configured — simulated refresh of ${touched} previously-linked repo(s). Add a token to sync a real org/account.`,
    });
  }

  try {
    const org = process.env.GITHUB_ORG;
    const res = await fetch(`https://api.github.com/orgs/${org}/repos?per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
    const repos = await res.json();

    let matched = 0;
    for (const repo of repos) {
      const project = projects.find((p) => p.name.toLowerCase() === repo.name.toLowerCase());
      if (project) {
        project.repoUrl = repo.html_url;
        const stamp = project.syncHistory.find((s) => s.source === "github_api");
        if (stamp) stamp.lastSeenAt = new Date().toISOString();
        else project.syncHistory.push({ source: "github_api", accountLabel: org ?? "github-org", lastSeenAt: new Date().toISOString(), reachable: true });
        matched++;
      }
    }
    return NextResponse.json({ ok: true, configured: true, message: `Matched ${matched} repo(s) to existing registry entries.` });
  } catch (err) {
    return NextResponse.json({ ok: false, configured: true, message: `GitHub sync failed: ${(err as Error).message}` }, { status: 502 });
  }
}

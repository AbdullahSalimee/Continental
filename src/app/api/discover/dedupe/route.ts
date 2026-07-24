import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorizeSyncRequest } from "@/lib/cron-auth";
import { normalizeName } from "@/lib/fuzzy-match";

// One-off cleanup: finds existing Project rows whose names normalize to the
// same thing (e.g. "super-admin" + "superadmin", "meher" + "meher-tk5d")
// and merges them into one, folding SyncStamp/InboxAccount/AIDecision
// references over first. This exists because duplicates created BEFORE the
// existing-project matching fix in /api/discover won't get cleaned up by
// future Discover runs on their own -- both names already exist as their
// own real projects, so neither looks "new" anymore. Safe to run multiple
// times; a clean registry is a no-op.
export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" }, // oldest wins as the canonical row
  });

  const groups = new Map<string, typeof projects>();
  for (const p of projects) {
    const key = normalizeName(p.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  let merged = 0;
  const mergedNames: string[] = [];
  const errors: string[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [canonical, ...duplicates] = group;

    for (const dup of duplicates) {
      try {
        await prisma.syncStamp.updateMany({
          where: { projectId: dup.id },
          data: { projectId: canonical.id },
        });
        await prisma.inboxAccount.updateMany({
          where: { linkedProjectId: dup.id },
          data: { linkedProjectId: canonical.id },
        });
        await prisma.aIDecision.updateMany({
          where: { targetProjectId: dup.id },
          data: { targetProjectId: canonical.id },
        });
        // Fill in anything the canonical row is missing from the duplicate
        // before deleting it, so no real data is lost in the merge.
        await prisma.project.update({
          where: { id: canonical.id },
          data: {
            liveUrl: canonical.liveUrl ?? dup.liveUrl,
            repoUrl: canonical.repoUrl ?? dup.repoUrl,
            databaseRef: canonical.databaseRef ?? dup.databaseRef,
            hostingPlatform:
              Array.from(
                new Set([
                  ...(canonical.hostingPlatform?.split(",").filter(Boolean) ??
                    []),
                  ...(dup.hostingPlatform?.split(",").filter(Boolean) ?? []),
                ]),
              ).join(",") || undefined,
          },
        });
        await prisma.project.delete({ where: { id: dup.id } });
        merged++;
        mergedNames.push(`"${dup.name}" -> "${canonical.name}"`);
      } catch (err) {
        errors.push(`${dup.name}: ${(err as Error).message}`);
      }
    }
  }

  if (merged > 0) {
    revalidatePath("/", "layout");
  }

  return NextResponse.json({
    ok: errors.length === 0,
    message: `Merged ${merged} duplicate project(s).${errors.length ? ` ${errors.length} error(s).` : ""}`,
    merged,
    mergedNames,
    errors,
  });
}

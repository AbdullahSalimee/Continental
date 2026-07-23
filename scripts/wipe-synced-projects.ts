// Wipes all synced/auto-discovered project data so the AI implementation
// (items 9-12 from the TODO) can be built and tested against a clean slate.
//
// Deletes: Project, SyncStamp (all rows — both are entirely sync-derived).
// Nulls out: InboxMessage.linkedProjectId / inferredProjectId references,
// so those rows survive but no longer point at a deleted project.
// Left untouched: Person, Role, Branch, Department, Client, ProfitEntry,
// ExternalAccount, AccessGrant, AuditLogEntry, LeadFlowLead, InboxMessage
// rows themselves (just their project links), InboxAccount.
//
// Run with: npx tsx scripts/wipe-synced-projects.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const projectCount = await prisma.project.count();
  const syncStampCount = await prisma.syncStamp.count();

  if (projectCount === 0 && syncStampCount === 0) {
    console.log("Nothing to wipe — no projects or sync stamps found.");
    return;
  }

  console.log(
    `Found ${projectCount} project(s) and ${syncStampCount} sync stamp(s) to remove.`,
  );

  // Unlink InboxAccount / InboxMessage from projects that are about to be
  // deleted, so the foreign keys don't fail and the inbox rows themselves survive.
  const unlinkedAccounts = await prisma.inboxAccount.updateMany({
    where: { linkedProjectId: { not: null } },
    data: { linkedProjectId: null },
  });
  const unlinkedMessages = await prisma.inboxMessage.updateMany({
    where: { inferredProjectId: { not: null } },
    data: { inferredProjectId: null },
  });
  console.log(
    `Unlinked ${unlinkedAccounts.count} inbox account(s) and ${unlinkedMessages.count} inbox message(s) from projects.`,
  );

  // SyncStamp has a required FK to Project, so it must go first.
  const deletedStamps = await prisma.syncStamp.deleteMany({});
  const deletedProjects = await prisma.project.deleteMany({});

  console.log(
    `\nDeleted ${deletedStamps.count} sync stamp(s) and ${deletedProjects.count} project(s).`,
  );
  console.log(
    "Done. People, branches, roles, clients, and everything else are untouched.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

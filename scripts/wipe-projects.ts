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

  const deletedStamps = await prisma.syncStamp.deleteMany({});
  const deletedProjects = await prisma.project.deleteMany({});

  console.log(
    `\nDeleted ${deletedStamps.count} sync stamp(s) and ${deletedProjects.count} project(s).`,
  );
  console.log(
    "Projects table cleared. Everything else is untouched.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

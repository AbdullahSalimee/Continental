import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const decisionCount = await prisma.aIDecision.count();
  const runCount = await prisma.discoverRun.count();

  if (decisionCount === 0 && runCount === 0) {
    console.log("Nothing to wipe — no AI decisions or discover runs found.");
    return;
  }

  console.log(
    `Found ${decisionCount} decision(s) and ${runCount} discover run(s) to remove.`,
  );

  const deletedDecisions = await prisma.aIDecision.deleteMany({});
  const deletedRuns = await prisma.discoverRun.deleteMany({});

  console.log(
    `\nDeleted ${deletedDecisions.count} AI decision(s) and ${deletedRuns.count} discover run(s).`,
  );
  console.log(
    "Projects, sync stamps, messages, and everything else are untouched.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

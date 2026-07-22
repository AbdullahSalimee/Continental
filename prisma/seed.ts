import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "continental-demo"; // seeded accounts only — see README before real use
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---- Roles ----------------------------------------------------------------
  const roleSuper = await prisma.role.create({ data: { name: "superadmin", description: "Full visibility everywhere, including LeadFlow." } });
  const roleDev = await prisma.role.create({ data: { name: "developer", description: "Visibility into branches/projects they work on." } });
  const roleDept = await prisma.role.create({ data: { name: "department_member", description: "Visibility limited to their own department's tools." } });

  // ---- Branches ---------------------------------------------------------------
  const remake = await prisma.branch.create({
    data: { name: "Remake Labs", focus: "Building and popularizing standalone web products.", createdAt: daysAgo(400) },
  });
  const kdh = await prisma.branch.create({
    data: {
      name: "KDH (Kasur Digital Hub)",
      focus: "Digitizing local businesses within Kasur, Pakistan, across all niches.",
      createdAt: daysAgo(300),
      notes:
        "Work starts only once price + concept are fixed. First month free. Branding billed separately " +
        "(unpaid branding => KDH may convert to multi-tenant resale). Delivery models: solo / multi-tenant / hybrid. " +
        "Out-of-domain leads still serviced but flagged. No outside-area hires. Domain never sold. KDH staff work exclusively for KDH.",
    },
  });
  const unassigned = await prisma.branch.create({
    data: { name: "Unassigned", focus: "Holding area for anything auto-detected before a human files it under a real branch.", createdAt: new Date() },
  });

  // ---- Departments --------------------------------------------------------------
  const deptProject = await prisma.department.create({ data: { branchId: kdh.id, name: "Project", isRestricted: false, successMetric: "on-time delivery" } });
  const deptLeadFlow = await prisma.department.create({
    data: {
      branchId: kdh.id,
      name: "LeadFlow",
      isRestricted: true,
      restrictedReason: "Lead data is restricted to superadmins by default. Access requires an explicit, auditable, one-off grant.",
      successMetric: "leads won",
    },
  });

  // ---- People (with real password hashes) --------------------------------------
  const sam = await prisma.person.create({ data: { name: "Sam (Founder)", email: "sam@continental.internal", passwordHash: hash, roleId: roleSuper.id, createdAt: daysAgo(400), branches: { connect: [{ id: remake.id }, { id: kdh.id }] }, departments: { connect: [{ id: deptProject.id }, { id: deptLeadFlow.id }] } } });
  const cofounder = await prisma.person.create({ data: { name: "Co-founder", email: "cofounder@continental.internal", passwordHash: hash, roleId: roleSuper.id, createdAt: daysAgo(400), branches: { connect: [{ id: remake.id }, { id: kdh.id }] }, departments: { connect: [{ id: deptProject.id }, { id: deptLeadFlow.id }] } } });
  const ali = await prisma.person.create({ data: { name: "Ali (Developer)", email: "ali@continental.internal", passwordHash: hash, roleId: roleDev.id, createdAt: daysAgo(200), branches: { connect: [{ id: remake.id }] } } });
  const hina = await prisma.person.create({ data: { name: "Hina (LeadFlow)", email: "hina@kdh.internal", passwordHash: hash, roleId: roleDept.id, createdAt: daysAgo(150), branches: { connect: [{ id: kdh.id }] }, departments: { connect: [{ id: deptLeadFlow.id }] } } });
  const bilal = await prisma.person.create({ data: { name: "Bilal (LeadFlow)", email: "bilal@kdh.internal", passwordHash: hash, roleId: roleDept.id, createdAt: daysAgo(150), branches: { connect: [{ id: kdh.id }] }, departments: { connect: [{ id: deptLeadFlow.id }] } } });

  // ---- External accounts (Module D: the actual "who holds this login" map) ------
  const vercelRemake = await prisma.externalAccount.create({ data: { platform: "vercel", label: "remake-labs+vercel1@gmail.com", vaultReference: "bitwarden://item/remake-vercel1", ownerPersonId: sam.id } });
  const vercelRemake2 = await prisma.externalAccount.create({ data: { platform: "vercel", label: "remake-labs+vercel2@gmail.com", vaultReference: "bitwarden://item/remake-vercel2", ownerPersonId: cofounder.id } });
  const netlifyRemake = await prisma.externalAccount.create({ data: { platform: "netlify", label: "remake-labs+netlify1@gmail.com", vaultReference: "bitwarden://item/remake-netlify1", ownerPersonId: cofounder.id } });
  const vercelKdh = await prisma.externalAccount.create({ data: { platform: "vercel", label: "kdh+vercel1@gmail.com", vaultReference: "bitwarden://item/kdh-vercel1", ownerPersonId: sam.id } });
  const githubRemake = await prisma.externalAccount.create({ data: { platform: "github", label: "remake-labs-org", vaultReference: "bitwarden://item/remake-github", ownerPersonId: sam.id } });
  const githubKdh = await prisma.externalAccount.create({ data: { platform: "github", label: "kdh-org", vaultReference: "bitwarden://item/kdh-github", ownerPersonId: cofounder.id } });
  const supabaseRemake = await prisma.externalAccount.create({ data: { platform: "supabase", label: "remake-labs+supabase1@gmail.com", vaultReference: "bitwarden://item/remake-supabase1", ownerPersonId: sam.id } });

  // Ali (a developer) shares logins to Remake Labs infra he actively deploys with —
  // this is the piece the earlier scaffold was missing: real login-sharing, not just in-app grants.
  await prisma.externalAccountAccess.createMany({
    data: [
      { externalAccountId: vercelRemake.id, personId: ali.id },
      { externalAccountId: githubRemake.id, personId: ali.id },
    ],
  });

  // ---- Clients --------------------------------------------------------------------
  const clientAlShifa = await prisma.client.create({ data: { name: "Al-Shifa Clinic", branchId: kdh.id } });
  const clientAcademy = await prisma.client.create({ data: { name: "Local Academy (AMS client)", branchId: kdh.id } });
  const clientGarment = await prisma.client.create({ data: { name: "Garment Business (demo)", branchId: kdh.id } });
  const clientRestaurant = await prisma.client.create({ data: { name: "Restaurant (demo)", branchId: kdh.id } });

  // ---- Projects ---------------------------------------------------------------------
  const taste = await prisma.project.create({
    data: {
      name: "Taste", branchId: remake.id, liveUrl: "https://taste.example.com", hostingPlatform: "vercel",
      externalAccountId: vercelRemake.id, repoUrl: "https://github.com/remake-labs/taste", databaseRef: "supabase:taste-prod",
      status: "live", createdAt: daysAgo(300), lastKnownUpdateAt: daysAgo(2), source: "auto",
      owners: { connect: [{ id: sam.id }, { id: ali.id }] },
      syncStamps: { create: [
        { source: "vercel_api", accountLabel: vercelRemake.label, lastSeenAt: new Date() },
        { source: "github_api", accountLabel: githubRemake.label, lastSeenAt: new Date() },
        { source: "supabase_api", accountLabel: supabaseRemake.label, lastSeenAt: daysAgo(1) },
      ] },
    },
  });
  const graphix = await prisma.project.create({
    data: {
      name: "Graphix", branchId: remake.id, liveUrl: "https://graphix.example.com", hostingPlatform: "vercel",
      externalAccountId: vercelRemake.id, repoUrl: "https://github.com/remake-labs/graphix", databaseRef: "supabase:graphix-prod",
      status: "live", createdAt: daysAgo(260), lastKnownUpdateAt: daysAgo(40), source: "auto",
      owners: { connect: [{ id: ali.id }] },
      syncStamps: { create: [{ source: "vercel_api", accountLabel: vercelRemake.label, lastSeenAt: new Date() }] },
    },
  });
  const lucent = await prisma.project.create({
    data: {
      name: "Lucent", branchId: remake.id, liveUrl: "https://lucent.example.com", hostingPlatform: "netlify",
      externalAccountId: netlifyRemake.id, repoUrl: "https://github.com/remake-labs/lucent",
      status: "broken", createdAt: daysAgo(220), lastKnownUpdateAt: daysAgo(190), source: "auto+manual",
      notes: "Drift detector flagged this dead 190 days ago — DNS resolves but app 500s.",
      owners: { connect: [{ id: cofounder.id }] },
      syncStamps: { create: [{ source: "vercel_api", accountLabel: vercelRemake.label, lastSeenAt: daysAgo(190), reachable: false }] },
    },
  });
  const neuropath = await prisma.project.create({
    data: {
      name: "Neuropath", branchId: remake.id, liveUrl: "https://neuropath.example.com", hostingPlatform: "vercel",
      externalAccountId: vercelRemake2.id, repoUrl: "https://github.com/remake-labs/neuropath", databaseRef: "supabase:neuropath-prod",
      status: "in_development", createdAt: daysAgo(90), lastKnownUpdateAt: daysAgo(3), source: "auto",
      notes: "E-learning / lecture platform.",
      owners: { connect: [{ id: sam.id }, { id: cofounder.id }, { id: ali.id }] },
      syncStamps: { create: [{ source: "vercel_api", accountLabel: vercelRemake2.label, lastSeenAt: new Date() }] },
    },
  });
  const ams = await prisma.project.create({
    data: {
      name: "AMS (Academy Management System)", branchId: kdh.id, departmentId: deptProject.id,
      liveUrl: "https://ams.kdh.example.com", hostingPlatform: "vercel", externalAccountId: vercelKdh.id,
      repoUrl: "https://github.com/kdh/ams", databaseRef: "supabase:ams-prod", status: "live",
      clientId: clientAcademy.id, deliveryModel: "solo", createdAt: daysAgo(180), lastKnownUpdateAt: daysAgo(5), source: "auto",
      owners: { connect: [{ id: sam.id }] },
      syncStamps: { create: [{ source: "vercel_api", accountLabel: vercelKdh.label, lastSeenAt: new Date() }] },
    },
  });
  const alShifa = await prisma.project.create({
    data: {
      name: "Al-Shifa", branchId: kdh.id, departmentId: deptProject.id, hostingPlatform: "vercel",
      externalAccountId: vercelKdh.id, repoUrl: "https://github.com/kdh/al-shifa", databaseRef: "supabase:al-shifa-dev",
      status: "in_development", clientId: clientAlShifa.id, deliveryModel: "hybrid", createdAt: daysAgo(60), lastKnownUpdateAt: daysAgo(1),
      notes: "Clinic website + queue management. Hybrid: started solo, scope grew.", source: "auto",
      owners: { connect: [{ id: cofounder.id }] },
      syncStamps: { create: [{ source: "github_api", accountLabel: githubKdh.label, lastSeenAt: new Date() }] },
    },
  });
  const garment = await prisma.project.create({
    data: {
      name: "Garment Business App", branchId: kdh.id, departmentId: deptProject.id, status: "demo_only",
      clientId: clientGarment.id, deliveryModel: "multi_tenant", createdAt: daysAgo(45), lastKnownUpdateAt: daysAgo(45),
      notes: "Demo stage — not yet deployed anywhere auto-detectable.", source: "manual",
      owners: { connect: [{ id: sam.id }] },
    },
  });
  const restaurant = await prisma.project.create({
    data: {
      name: "Restaurant App", branchId: kdh.id, departmentId: deptProject.id, status: "demo_only",
      clientId: clientRestaurant.id, deliveryModel: "multi_tenant", createdAt: daysAgo(30), lastKnownUpdateAt: daysAgo(30), source: "manual",
      owners: { connect: [{ id: cofounder.id }] },
    },
  });

  // ---- Inbox (Module B) — real schema, ready for real Gmail OAuth connections -----
  const inboxTaste = await prisma.inboxAccount.create({ data: { label: "taste-support@gmail.com", strategy: "polling", linkedProjectId: taste.id } });
  const inboxKdh = await prisma.inboxAccount.create({ data: { label: "hello@kdh.example.com", strategy: "polling" } });
  const inboxAms = await prisma.inboxAccount.create({ data: { label: "ams-support@gmail.com", strategy: "forwarding", linkedProjectId: ams.id } });
  const inboxNeuropath = await prisma.inboxAccount.create({ data: { label: "neuropath@gmail.com", strategy: "polling", linkedProjectId: neuropath.id } });

  await prisma.inboxMessage.createMany({
    data: [
      { accountId: inboxTaste.id, from: "user447@icloud.com", subject: "Can't log in to Taste", snippet: "Hey, I've been trying to log in since yesterday and it keeps...", receivedAt: new Date(), handled: false, inferredProjectId: taste.id },
      { accountId: inboxKdh.id, from: "newclient@gmail.com", subject: "Interested in a website for my bakery", snippet: "Salam, I run a small bakery in Kasur and wanted to ask about...", receivedAt: new Date(), handled: false },
      { accountId: inboxAms.id, from: "principal@localacademy.edu.pk", subject: "Attendance export not working", snippet: "The monthly attendance CSV export gave an error this morning...", receivedAt: daysAgo(1), handled: false, inferredProjectId: ams.id },
      { accountId: inboxNeuropath.id, from: "instructor22@gmail.com", subject: "Video upload limit question", snippet: "Is there a file size cap on lecture video uploads? Trying to...", receivedAt: daysAgo(2), handled: true, inferredProjectId: neuropath.id },
    ],
  });

  // ---- Profit + focus notes (Module C) -----------------------------------------
  await prisma.profitEntry.createMany({
    data: [
      { branchId: kdh.id, amount: 45000, currency: "PKR", note: "AMS milestone payment", recordedAt: daysAgo(20), recordedByPersonId: sam.id },
      { branchId: kdh.id, amount: 15000, currency: "PKR", note: "Al-Shifa deposit", recordedAt: daysAgo(10), recordedByPersonId: cofounder.id },
      { branchId: remake.id, amount: 300, currency: "USD", note: "Taste subscription revenue (month)", recordedAt: daysAgo(15), recordedByPersonId: sam.id },
    ],
  });
  await prisma.branchFocusNote.createMany({
    data: [
      { branchId: remake.id, note: "Fix Lucent's 500 error or formally decommission it. Push Neuropath toward a soft launch.", updatedByPersonId: sam.id },
      { branchId: kdh.id, note: "Close Al-Shifa scope conversation (hybrid terms) before adding more dev time.", updatedByPersonId: cofounder.id },
    ],
  });

  // ---- Access grants + audit log (Module D) --------------------------------------
  await prisma.accessGrant.create({ data: { personId: ali.id, targetType: "project", targetId: taste.id, level: "editor", vaultReference: "bitwarden://item/taste-vercel", grantedByPersonId: sam.id, grantedAt: daysAgo(300) } });
  await prisma.accessGrant.create({ data: { personId: ali.id, targetType: "project", targetId: graphix.id, level: "editor", vaultReference: "bitwarden://item/graphix-vercel", grantedByPersonId: sam.id, grantedAt: daysAgo(260) } });
  await prisma.accessGrant.create({ data: { personId: sam.id, targetType: "branch", targetId: kdh.id, level: "owner", grantedByPersonId: sam.id, grantedAt: daysAgo(400) } });
  const tempGrant = await prisma.accessGrant.create({ data: { personId: ali.id, targetType: "department", targetId: deptLeadFlow.id, level: "viewer", grantedByPersonId: sam.id, grantedAt: daysAgo(2), expiresAt: new Date(Date.now() + 5 * 86400000) } });

  await prisma.auditLogEntry.createMany({
    data: [
      { actorPersonId: sam.id, action: "grant_access", targetDescription: "Ali (Developer) -> LeadFlow department (viewer, expires in 5 days)", sensitive: true, at: daysAgo(2) },
      { actorPersonId: sam.id, action: "grant_access", targetDescription: "Ali (Developer) -> Taste (editor)", sensitive: false, at: daysAgo(300) },
    ],
  });

  // ---- LeadFlow leads (restricted) ------------------------------------------------
  await prisma.leadFlowLead.createMany({
    data: [
      { clientName: "Kasur Bakery Co.", city: "Kasur", status: "won", ownerPersonId: hina.id, createdAt: daysAgo(40) },
      { clientName: "Green Valley Garments", city: "Kasur", status: "negotiating", ownerPersonId: bilal.id, createdAt: daysAgo(15) },
      { clientName: "City Dental Clinic", city: "Kasur", status: "won", ownerPersonId: hina.id, createdAt: daysAgo(70) },
      { clientName: "Lahore Textile House", city: "Lahore", status: "new", ownerPersonId: bilal.id, createdAt: daysAgo(3) },
      { clientName: "Fresh Mart", city: "Kasur", status: "lost", ownerPersonId: hina.id, createdAt: daysAgo(25) },
    ],
  });

  console.log("Seed complete.");
  console.log(`Demo login password for every seeded person: "${DEMO_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

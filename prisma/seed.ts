import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "continental-2026"; // shared dev password — rotate before real use
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---- Roles ----------------------------------------------------------------
  const roleSuper = await prisma.role.create({
    data: {
      name: "superadmin",
      description: "Full visibility everywhere, including LeadFlow.",
    },
  });
  const roleDev = await prisma.role.create({
    data: {
      name: "developer",
      description: "Visibility into branches/projects they work on.",
    },
  });
  const roleDept = await prisma.role.create({
    data: {
      name: "department_member",
      description: "Visibility limited to their own department's tools.",
    },
  });

  // ---- Domains ---------------------------------------------------------------
  const kdh = await prisma.domain.create({
    data: {
      name: "KDH (Kasur Digital Hub)",
      focus:
        "Digitizing local businesses within Kasur, Pakistan, across all niches.",
      createdAt: daysAgo(300),
      notes:
        "Work starts only once price + concept are fixed. First month free. Branding billed separately " +
        "(unpaid branding => KDH may convert to multi-tenant resale). Delivery models: solo / multi-tenant / hybrid. " +
        "Out-of-domain leads still serviced but flagged. No outside-area hires. Domain never sold. KDH staff work exclusively for KDH.",
    },
  });
  const remakeLabs = await prisma.domain.create({
    data: {
      name: "Remakes Labs",
      domainType: "no_clients",
      focus:
        "Builds alternative versions of popular websites, then markets them. Creative/experimental domain — no clients.",
      createdAt: daysAgo(400),
      notes:
        "Remakes Labs has no client relationships — projects are self-directed products, not client work. The client field does not apply to this domain.",
    },
  });
  const fiverr = await prisma.domain.create({
    data: { name: "Fiverr", focus: "Coming soon.", createdAt: new Date() },
  });
  const unassigned = await prisma.domain.create({
    data: {
      name: "Unassigned",
      focus:
        "Holding area for anything auto-detected before a human files it under a real domain.",
      createdAt: new Date(),
    },
  });

  // ---- Departments --------------------------------------------------------------
  const deptProject = await prisma.department.create({
    data: {
      domainId: kdh.id,
      name: "Project",
      isRestricted: false,
      successMetric: "on-time delivery",
    },
  });
  const deptLeadFlow = await prisma.department.create({
    data: {
      domainId: kdh.id,
      name: "LeadFlow",
      isRestricted: true,
      restrictedReason:
        "Lead data is restricted to superadmins by default. Access requires an explicit, auditable, one-off grant.",
      successMetric: "leads won",
    },
  });

  // ---- People (real Continental team, real password hashes) --------------------
  const abdullah = await prisma.person.create({
    data: {
      name: "Abdullah Arif (Co-owner)",
      email: "abdullaharifsalimee@gmail.com",
      passwordHash: hash,
      roleId: roleSuper.id,
      createdAt: daysAgo(400),
      domains: {
        connect: [{ id: kdh.id }, { id: remakeLabs.id }, { id: fiverr.id }],
      },
      departments: {
        connect: [{ id: deptProject.id }, { id: deptLeadFlow.id }],
      },
    },
  });
  const furqan = await prisma.person.create({
    data: {
      name: "Furqan Ahmed (Co-owner)",
      email: "furqanahmed1872@gmail.com",
      passwordHash: hash,
      roleId: roleSuper.id,
      createdAt: daysAgo(400),
      domains: {
        connect: [{ id: kdh.id }, { id: remakeLabs.id }, { id: fiverr.id }],
      },
      departments: {
        connect: [{ id: deptProject.id }, { id: deptLeadFlow.id }],
      },
    },
  });
  const arslan = await prisma.person.create({
    data: {
      name: "Arslan Ahmed (Developer)",
      email: "drmuhammadarifsaleemi@gmail.com",
      passwordHash: hash,
      roleId: roleDev.id,
      createdAt: daysAgo(200),
      domains: { connect: [{ id: kdh.id }, { id: remakeLabs.id }] },
      departments: { connect: [{ id: deptLeadFlow.id }] },
    },
  });
  const sukhran = await prisma.person.create({
    data: {
      name: "Sukhran (Leads)",
      email: "abdulrehmanch4230@gmail.com",
      passwordHash: hash,
      roleId: roleDept.id,
      createdAt: daysAgo(150),
      domains: { connect: [{ id: kdh.id }] },
      departments: { connect: [{ id: deptLeadFlow.id }] },
    },
  });
  const jazil = await prisma.person.create({
    data: {
      name: "Jazil Sardar (Leads)",
      email: "jazilansari12@gmail.com",
      passwordHash: hash,
      roleId: roleDept.id,
      createdAt: daysAgo(150),
      domains: { connect: [{ id: kdh.id }] },
      departments: { connect: [{ id: deptLeadFlow.id }] },
    },
  });

  // ---- Clients (KDH only — Remakes Labs has no clients) --------------------------
  const clientAlShifa = await prisma.client.create({
    data: { name: "Al-Shifa Clinic", domainId: kdh.id },
  });
  const clientAcademy = await prisma.client.create({
    data: { name: "Local Academy (AMS client)", domainId: kdh.id },
  });

  // ---- Focus notes ----------------------------------------------------------------
await prisma.domainFocusNote.createMany({
    data: [
      {
        domainId: kdh.id,
        note: "Close Al-Shifa scope conversation (hybrid terms) before adding more dev time.",
        updatedByPersonId: abdullah.id,
      },
      {
        domainId: remakeLabs.id,
        note: "Pick the next popular site to remake and start scoping the build.",
        updatedByPersonId: furqan.id,
      },
    ],
  });

  console.log("Seed complete.");
  console.log(
    `Demo login password for every seeded person: "${DEMO_PASSWORD}"`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

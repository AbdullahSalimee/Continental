import type {
  AccessGrant,
  AuditLogEntry,
  Branch,
  BranchFocusNote,
  Client,
  Department,
  InboxAccount,
  InboxMessage,
  LeadFlowLead,
  Person,
  ProfitEntry,
  Project,
  Role,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────
// PRODUCTION NOTE: this module is an in-memory store so the whole system
// is runnable and demoable with zero external setup. It is a stand-in for
// a real database (Postgres via Prisma/Drizzle is the natural choice —
// note this is a DIFFERENT database than the Supabase projects being
// tracked *as data* in Module A; Continental OS's own persistence should
// not itself live inside one of the tracked client projects).
//
// Every function below is written the way a repository/DAO layer would be,
// specifically so that swapping the array operations for real SQL calls
// later does not require touching any page or API route that calls these.
// ─────────────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
let idCounter = 1000;
const nid = (prefix: string) => `${prefix}_${idCounter++}`;

// ---- Roles ------------------------------------------------------------------
export const roles: Role[] = [
  { id: "role_superadmin", name: "superadmin", description: "Full visibility everywhere, including LeadFlow." },
  { id: "role_developer", name: "developer", description: "Visibility into branches/projects they work on." },
  { id: "role_dept", name: "department_member", description: "Visibility limited to their own department's tools." },
];

// ---- Branches -----------------------------------------------------------
export const branches: Branch[] = [
  {
    id: "branch_remake",
    name: "Remake Labs",
    focus: "Building and popularizing standalone web products.",
    createdAt: daysAgo(400),
  },
  {
    id: "branch_kdh",
    name: "KDH (Kasur Digital Hub)",
    focus: "Digitizing local businesses within Kasur, Pakistan, across all niches.",
    createdAt: daysAgo(300),
    notes:
      "Work starts only once price + concept are fixed. First month free. Branding billed separately " +
      "(unpaid branding => KDH may convert to multi-tenant resale). Delivery models: solo / multi-tenant / hybrid. " +
      "Out-of-domain leads still serviced but flagged. No outside-area hires. Domain never sold. " +
      "KDH staff work exclusively for KDH.",
  },
  {
    id: "branch_unassigned",
    name: "Unassigned",
    focus:
      "Holding area for anything auto-detected by a sync job before a human files it under a real branch. " +
      "Not a real branch — just keeps the registry complete even when automation outruns manual triage.",
    createdAt: daysAgo(0),
  },
];

// ---- Departments ----------------------------------------------------------
export const departments: Department[] = [
  {
    id: "dept_kdh_project",
    branchId: "branch_kdh",
    name: "Project",
    isRestricted: false,
    successMetric: "on-time delivery",
  },
  {
    id: "dept_kdh_leadflow",
    branchId: "branch_kdh",
    name: "LeadFlow",
    isRestricted: true,
    restrictedReason:
      "Lead data is restricted to superadmins by default. Access requires an explicit, auditable, one-off grant.",
    successMetric: "leads won", // never raw lead volume, per PRD
  },
];

// ---- People -----------------------------------------------------------------
export const people: Person[] = [
  {
    id: "person_founder1",
    name: "Sam (Founder)",
    email: "sam@continental.internal",
    roleId: "role_superadmin",
    branchIds: ["branch_remake", "branch_kdh"],
    departmentIds: ["dept_kdh_project", "dept_kdh_leadflow"],
    active: true,
    createdAt: daysAgo(400),
  },
  {
    id: "person_founder2",
    name: "Co-founder",
    email: "cofounder@continental.internal",
    roleId: "role_superadmin",
    branchIds: ["branch_remake", "branch_kdh"],
    departmentIds: ["dept_kdh_project", "dept_kdh_leadflow"],
    active: true,
    createdAt: daysAgo(400),
  },
  {
    id: "person_dev1",
    name: "Ali (Developer)",
    email: "ali@continental.internal",
    roleId: "role_developer",
    branchIds: ["branch_remake"],
    departmentIds: [],
    active: true,
    createdAt: daysAgo(200),
  },
  {
    id: "person_lead1",
    name: "Hina (LeadFlow)",
    email: "hina@kdh.internal",
    roleId: "role_dept",
    branchIds: ["branch_kdh"],
    departmentIds: ["dept_kdh_leadflow"],
    active: true,
    createdAt: daysAgo(150),
  },
  {
    id: "person_lead2",
    name: "Bilal (LeadFlow)",
    email: "bilal@kdh.internal",
    roleId: "role_dept",
    branchIds: ["branch_kdh"],
    departmentIds: ["dept_kdh_leadflow"],
    active: true,
    createdAt: daysAgo(150),
  },
];

// ---- Clients ------------------------------------------------------------
export const clients: Client[] = [
  { id: "client_alshifa", name: "Al-Shifa Clinic", branchId: "branch_kdh" },
  { id: "client_academy", name: "Local Academy (AMS client)", branchId: "branch_kdh" },
  { id: "client_garment", name: "Garment Business (demo)", branchId: "branch_kdh" },
  { id: "client_restaurant", name: "Restaurant (demo)", branchId: "branch_kdh" },
];

// ---- Projects (Module A) -----------------------------------------------
export const projects: Project[] = [
  {
    id: "proj_taste",
    name: "Taste",
    branchId: "branch_remake",
    liveUrl: "https://taste.example.com",
    hostingPlatform: "vercel",
    hostingAccountLabel: "remake-labs+vercel1@gmail.com",
    repoUrl: "https://github.com/remake-labs/taste",
    databaseRef: "supabase:taste-prod",
    status: "live",
    createdAt: daysAgo(300),
    lastKnownUpdateAt: daysAgo(2),
    ownerPersonIds: ["person_founder1", "person_dev1"],
    source: "auto",
    syncHistory: [
      { source: "vercel_api", accountLabel: "remake-labs+vercel1@gmail.com", lastSeenAt: daysAgo(0), reachable: true },
      { source: "github_api", accountLabel: "remake-labs-org", lastSeenAt: daysAgo(0), reachable: true },
      { source: "supabase_api", accountLabel: "remake-labs+supabase1@gmail.com", lastSeenAt: daysAgo(1), reachable: true },
    ],
  },
  {
    id: "proj_graphix",
    name: "Graphix",
    branchId: "branch_remake",
    liveUrl: "https://graphix.example.com",
    hostingPlatform: "vercel",
    hostingAccountLabel: "remake-labs+vercel1@gmail.com",
    repoUrl: "https://github.com/remake-labs/graphix",
    databaseRef: "supabase:graphix-prod",
    status: "live",
    createdAt: daysAgo(260),
    lastKnownUpdateAt: daysAgo(40),
    ownerPersonIds: ["person_dev1"],
    source: "auto",
    syncHistory: [
      { source: "vercel_api", accountLabel: "remake-labs+vercel1@gmail.com", lastSeenAt: daysAgo(0), reachable: true },
    ],
  },
  {
    id: "proj_lucent",
    name: "Lucent",
    branchId: "branch_remake",
    liveUrl: "https://lucent.example.com",
    hostingPlatform: "netlify",
    hostingAccountLabel: "remake-labs+netlify1@gmail.com",
    repoUrl: "https://github.com/remake-labs/lucent",
    status: "broken",
    createdAt: daysAgo(220),
    lastKnownUpdateAt: daysAgo(190),
    ownerPersonIds: ["person_founder2"],
    source: "auto+manual",
    notes: "Drift detector flagged this dead 190 days ago — DNS resolves but app 500s.",
    syncHistory: [
      { source: "vercel_api", accountLabel: "remake-labs+vercel1@gmail.com", lastSeenAt: daysAgo(190), reachable: false },
    ],
  },
  {
    id: "proj_neuropath",
    name: "Neuropath",
    branchId: "branch_remake",
    liveUrl: "https://neuropath.example.com",
    hostingPlatform: "vercel",
    hostingAccountLabel: "remake-labs+vercel2@gmail.com",
    repoUrl: "https://github.com/remake-labs/neuropath",
    databaseRef: "supabase:neuropath-prod",
    status: "in_development",
    createdAt: daysAgo(90),
    lastKnownUpdateAt: daysAgo(3),
    ownerPersonIds: ["person_founder1", "person_founder2", "person_dev1"],
    source: "auto",
    notes: "E-learning / lecture platform.",
    syncHistory: [
      { source: "vercel_api", accountLabel: "remake-labs+vercel2@gmail.com", lastSeenAt: daysAgo(0), reachable: true },
    ],
  },
  {
    id: "proj_ams",
    name: "AMS (Academy Management System)",
    branchId: "branch_kdh",
    departmentId: "dept_kdh_project",
    liveUrl: "https://ams.kdh.example.com",
    hostingPlatform: "vercel",
    hostingAccountLabel: "kdh+vercel1@gmail.com",
    repoUrl: "https://github.com/kdh/ams",
    databaseRef: "supabase:ams-prod",
    status: "live",
    clientId: "client_academy",
    deliveryModel: "solo",
    createdAt: daysAgo(180),
    lastKnownUpdateAt: daysAgo(5),
    ownerPersonIds: ["person_founder1"],
    source: "auto",
    syncHistory: [
      { source: "vercel_api", accountLabel: "kdh+vercel1@gmail.com", lastSeenAt: daysAgo(0), reachable: true },
    ],
  },
  {
    id: "proj_alshifa",
    name: "Al-Shifa",
    branchId: "branch_kdh",
    departmentId: "dept_kdh_project",
    hostingPlatform: "vercel",
    hostingAccountLabel: "kdh+vercel1@gmail.com",
    repoUrl: "https://github.com/kdh/al-shifa",
    databaseRef: "supabase:al-shifa-dev",
    status: "in_development",
    clientId: "client_alshifa",
    deliveryModel: "hybrid",
    createdAt: daysAgo(60),
    lastKnownUpdateAt: daysAgo(1),
    ownerPersonIds: ["person_founder2"],
    notes: "Clinic website + queue management. Hybrid: started solo, scope grew.",
    source: "auto",
    syncHistory: [
      { source: "github_api", accountLabel: "kdh-org", lastSeenAt: daysAgo(0), reachable: true },
    ],
  },
  {
    id: "proj_garment",
    name: "Garment Business App",
    branchId: "branch_kdh",
    departmentId: "dept_kdh_project",
    status: "demo_only",
    clientId: "client_garment",
    deliveryModel: "multi_tenant",
    createdAt: daysAgo(45),
    lastKnownUpdateAt: daysAgo(45),
    ownerPersonIds: ["person_founder1"],
    source: "manual",
    notes: "Demo stage — not yet deployed anywhere auto-detectable.",
    syncHistory: [],
  },
  {
    id: "proj_restaurant",
    name: "Restaurant App",
    branchId: "branch_kdh",
    departmentId: "dept_kdh_project",
    status: "demo_only",
    clientId: "client_restaurant",
    deliveryModel: "multi_tenant",
    createdAt: daysAgo(30),
    lastKnownUpdateAt: daysAgo(30),
    ownerPersonIds: ["person_founder2"],
    source: "manual",
    syncHistory: [],
  },
];

// ---- Inbox (Module B) -----------------------------------------------------
export const inboxAccounts: InboxAccount[] = [
  { id: "inbox_taste", label: "taste-support@gmail.com", strategy: "polling", linkedProjectId: "proj_taste" },
  { id: "inbox_kdh", label: "hello@kdh.example.com", strategy: "polling" },
  { id: "inbox_ams", label: "ams-support@gmail.com", strategy: "forwarding", linkedProjectId: "proj_ams" },
  { id: "inbox_neuropath", label: "neuropath@gmail.com", strategy: "polling", linkedProjectId: "proj_neuropath" },
];

export const inboxMessages: InboxMessage[] = [
  {
    id: "msg_1",
    accountId: "inbox_taste",
    from: "user447@icloud.com",
    subject: "Can't log in to Taste",
    snippet: "Hey, I've been trying to log in since yesterday and it keeps...",
    receivedAt: daysAgo(0),
    handled: false,
    inferredProjectId: "proj_taste",
  },
  {
    id: "msg_2",
    accountId: "inbox_kdh",
    from: "newclient@gmail.com",
    subject: "Interested in a website for my bakery",
    snippet: "Salam, I run a small bakery in Kasur and wanted to ask about...",
    receivedAt: daysAgo(0),
    handled: false,
  },
  {
    id: "msg_3",
    accountId: "inbox_ams",
    from: "principal@localacademy.edu.pk",
    subject: "Attendance export not working",
    snippet: "The monthly attendance CSV export gave an error this morning...",
    receivedAt: daysAgo(1),
    handled: false,
    inferredProjectId: "proj_ams",
  },
  {
    id: "msg_4",
    accountId: "inbox_neuropath",
    from: "instructor22@gmail.com",
    subject: "Video upload limit question",
    snippet: "Is there a file size cap on lecture video uploads? Trying to...",
    receivedAt: daysAgo(2),
    handled: true,
    inferredProjectId: "proj_neuropath",
  },
];

// ---- Branch Intelligence (Module C) ---------------------------------------
export const profitEntries: ProfitEntry[] = [
  { id: "profit_1", branchId: "branch_kdh", amount: 45000, currency: "PKR", note: "AMS milestone payment", recordedAt: daysAgo(20), recordedByPersonId: "person_founder1", verified: "self_reported" },
  { id: "profit_2", branchId: "branch_kdh", amount: 15000, currency: "PKR", note: "Al-Shifa deposit", recordedAt: daysAgo(10), recordedByPersonId: "person_founder2", verified: "self_reported" },
  { id: "profit_3", branchId: "branch_remake", amount: 300, currency: "USD", note: "Taste subscription revenue (month)", recordedAt: daysAgo(15), recordedByPersonId: "person_founder1", verified: "self_reported" },
];

export const branchFocusNotes: BranchFocusNote[] = [
  { branchId: "branch_remake", note: "Fix Lucent's 500 error or formally decommission it. Push Neuropath toward a soft launch.", updatedAt: daysAgo(3), updatedByPersonId: "person_founder1" },
  { branchId: "branch_kdh", note: "Close Al-Shifa scope conversation (hybrid terms) before adding more dev time.", updatedAt: daysAgo(1), updatedByPersonId: "person_founder2" },
];

// ---- Access & Ownership (Module D) -----------------------------------------
export const accessGrants: AccessGrant[] = [
  { id: "grant_1", personId: "person_dev1", targetType: "project", targetId: "proj_taste", level: "editor", vaultReference: "bitwarden://item/taste-vercel", grantedAt: daysAgo(300), grantedByPersonId: "person_founder1" },
  { id: "grant_2", personId: "person_dev1", targetType: "project", targetId: "proj_graphix", level: "editor", vaultReference: "bitwarden://item/graphix-vercel", grantedAt: daysAgo(260), grantedByPersonId: "person_founder1" },
  { id: "grant_3", personId: "person_founder1", targetType: "branch", targetId: "branch_kdh", level: "owner", grantedAt: daysAgo(400), grantedByPersonId: "person_founder1" },
  // Example of the "explicit, auditable, one-off grant" the PRD requires for LeadFlow exceptions:
  {
    id: "grant_leadflow_temp",
    personId: "person_dev1",
    targetType: "department",
    targetId: "dept_kdh_leadflow",
    level: "viewer",
    grantedAt: daysAgo(2),
    grantedByPersonId: "person_founder1",
    expiresAt: daysAgo(-5), // expires 5 days from now
  },
];

export const auditLog: AuditLogEntry[] = [
  { id: "audit_1", at: daysAgo(2), actorPersonId: "person_founder1", action: "grant_access", targetDescription: "Ali (Developer) -> LeadFlow department (viewer, expires in 5 days)", sensitive: true },
  { id: "audit_2", at: daysAgo(300), actorPersonId: "person_founder1", action: "grant_access", targetDescription: "Ali (Developer) -> Taste (editor)", sensitive: false },
];

// ---- LeadFlow leads (restricted) -------------------------------------------
export const leadFlowLeads: LeadFlowLead[] = [
  { id: "lead_1", clientName: "Kasur Bakery Co.", city: "Kasur", status: "won", ownerPersonId: "person_lead1", createdAt: daysAgo(40) },
  { id: "lead_2", clientName: "Green Valley Garments", city: "Kasur", status: "negotiating", ownerPersonId: "person_lead2", createdAt: daysAgo(15) },
  { id: "lead_3", clientName: "City Dental Clinic", city: "Kasur", status: "won", ownerPersonId: "person_lead1", createdAt: daysAgo(70) },
  { id: "lead_4", clientName: "Lahore Textile House", city: "Lahore", status: "new", ownerPersonId: "person_lead2", createdAt: daysAgo(3) },
  { id: "lead_5", clientName: "Fresh Mart", city: "Kasur", status: "lost", ownerPersonId: "person_lead1", createdAt: daysAgo(25) },
];

// ---- Helpers ----------------------------------------------------------------
export function getPersonRole(person: Person): Role {
  return roles.find((r) => r.id === person.roleId)!;
}

export function upsertProjectFromSync(input: Partial<Project> & { name: string; branchId: string }) {
  const existing = projects.find(
    (p) => p.name.toLowerCase() === input.name.toLowerCase() && p.branchId === input.branchId
  );
  if (existing) {
    Object.assign(existing, input, {
      // never let a sync silently wipe manually-added context
      branchId: existing.branchId,
      departmentId: existing.departmentId,
      clientId: existing.clientId,
      deliveryModel: existing.deliveryModel,
      notes: existing.notes,
    });
    existing.lastKnownUpdateAt = now();
    return existing;
  }
  const created: Project = {
    id: nid("proj"),
    status: "live",
    createdAt: now(),
    lastKnownUpdateAt: now(),
    ownerPersonIds: [],
    source: "auto",
    syncHistory: [],
    ...input,
  };
  projects.push(created);
  return created;
}

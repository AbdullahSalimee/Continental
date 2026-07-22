// ─────────────────────────────────────────────────────────────────────────
// Continental OS — Core Domain Types
//
// Design note: Branch, Department, Role, ProjectStatus, and HostingPlatform
// are all modeled as open lists (rows in a table / entries in an array),
// NEVER as fixed TypeScript union types or enums. This is deliberate:
// the PRD requires that new branches, departments, and statuses can be
// added at runtime, through the system itself, without a code change.
// A hardcoded union type would violate that constraint the moment someone
// tried to add "Fiverr Freelance" as a branch.
// ─────────────────────────────────────────────────────────────────────────

export type ID = string;

// ---- Reference data (open/extensible lists) --------------------------------

export interface Branch {
  id: ID;
  name: string;
  focus: string;
  createdAt: string;
  // Free-form rules text — KDH's business rules live here as data, not logic,
  // so they can be represented/displayed without being hard-coded into the app.
  notes?: string;
}

export interface Department {
  id: ID;
  branchId: ID;
  name: string;
  // Marks departments that need the strict isolation behavior (LeadFlow).
  // This is a DATA flag, not a name check — nothing in the access-control
  // logic ever does `if (department.name === "LeadFlow")`. See rbac.ts.
  isRestricted: boolean;
  restrictedReason?: string;
  successMetric?: string; // e.g. "leads won" for LeadFlow — not "leads added"
}

export type RoleName = "superadmin" | "developer" | "department_member" | string; // extensible

export interface Role {
  id: ID;
  name: RoleName;
  description: string;
}

export interface Person {
  id: ID;
  name: string;
  email: string;
  roleId: ID;
  // Which branches this person is generally attached to (drives Module C headcount)
  branchIds: ID[];
  departmentIds: ID[];
  active: boolean;
  createdAt: string;
}

// ---- Module A: Project Registry --------------------------------------------

export type ProjectStatus =
  | "live"
  | "broken"
  | "in_development"
  | "archived"
  | "demo_only"
  | "decommissioned"
  | string; // status list is editable, not fixed forever

export type HostingPlatform = "vercel" | "netlify" | "other" | string;

export type SyncSource = "vercel_api" | "github_api" | "supabase_api" | "manual";

export interface SyncStamp {
  source: SyncSource;
  accountLabel: string; // which connected account this came from (account sprawl problem)
  lastSeenAt: string;
  reachable: boolean | null; // null = unknown / not checked
}

export type DeliveryModel = "solo" | "multi_tenant" | "hybrid" | string;

export interface Client {
  id: ID;
  name: string;
  branchId: ID;
  isOutOfDomain?: boolean; // KDH: leads/clients from outside Kasur
  notes?: string;
}

export interface Project {
  id: ID;
  name: string;
  branchId: ID;
  departmentId?: ID;
  liveUrl?: string;
  previewUrls?: string[];
  hostingPlatform?: HostingPlatform;
  hostingAccountLabel?: string; // which Google/Vercel account owns this deployment
  repoUrl?: string;
  databaseRef?: string; // e.g. "supabase:project-ref-xyz"
  status: ProjectStatus;
  clientId?: ID;
  deliveryModel?: DeliveryModel;
  createdAt: string;
  lastKnownUpdateAt: string;
  ownerPersonIds: ID[];
  notes?: string;
  // Every field above can come from manual entry OR automation.
  // syncHistory is how we know which is which, and when it was last verified alive.
  syncHistory: SyncStamp[];
  source: "auto" | "manual" | "auto+manual";
}

// ---- Module B: Unified Inbox -----------------------------------------------

export interface InboxAccount {
  id: ID;
  label: string; // e.g. "taste-support@..."
  strategy: "polling" | "forwarding";
  linkedProjectId?: ID;
  connected?: boolean; // true once a real Gmail OAuth refresh token is on file
}

export interface InboxMessage {
  id: ID;
  accountId: ID;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  handled: boolean;
  inferredProjectId?: ID;
}

// ---- Module C: Branch Intelligence -----------------------------------------

export interface ProfitEntry {
  id: ID;
  branchId: ID;
  amount: number;
  currency: string;
  note: string;
  recordedAt: string;
  recordedByPersonId: ID;
  // Explicitly marked self-reported vs live/verified per the PRD's requirement
  // that the system always know which numbers are "live" vs "self-reported."
  verified: "self_reported"; // only value today — automation isn't realistic for money
}

export interface BranchFocusNote {
  branchId: ID;
  note: string;
  updatedAt: string;
  updatedByPersonId: ID;
}

// ---- Module D: Access & Ownership Map --------------------------------------

export interface AccessGrant {
  id: ID;
  personId: ID;
  // A grant targets EITHER a project, a branch, or (rare, audited) LeadFlow-department data.
  targetType: "project" | "branch" | "department";
  targetId: ID;
  level: "owner" | "editor" | "viewer";
  vaultReference?: string; // link/reference into Bitwarden (or chosen vault), never a raw secret
  grantedAt: string;
  grantedByPersonId: ID;
  expiresAt?: string; // supports "temporary/specific access" grants, e.g. into LeadFlow
}

export interface AuditLogEntry {
  id: ID;
  at: string;
  actorPersonId: ID;
  action: string; // e.g. "grant_access", "revoke_access", "view_leadflow"
  targetDescription: string;
  sensitive: boolean;
}

// ---- LeadFlow (restricted department data) ---------------------------------

export interface LeadFlowLead {
  id: ID;
  clientName: string;
  city: string;
  status: "new" | "contacted" | "negotiating" | "won" | "lost" | string;
  ownerPersonId: ID;
  createdAt: string;
}

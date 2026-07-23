import { prisma } from "./prisma";
import type {
  AccessGrant,
  AuditLogEntry,
  Domain,
  DomainFocusNote,
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
// This is the real repository layer, backed by SQLite via Prisma
// (see prisma/schema.prisma). Data now persists across restarts.
// Every function returns plain, JSON-serializable objects (dates as ISO
// strings) so they can pass safely from server components to client
// components without extra mapping at each call site.
// ─────────────────────────────────────────────────────────────────────────

export async function getRoles(): Promise<Role[]> {
  return prisma.role.findMany();
}

export async function getPersonRoleById(roleId: string): Promise<Role> {
  const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
  return role;
}

export async function getPeople(): Promise<Person[]> {
  const rows = await prisma.person.findMany({
    include: { domains: true, departments: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    roleId: p.roleId,
    domainIds: p.domains.map((b) => b.id),
    departmentIds: p.departments.map((d) => d.id),
    active: p.active,
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function getPersonById(id: string): Promise<Person | null> {
  const p = await prisma.person.findUnique({
    where: { id },
    include: { domains: true, departments: true },
  });
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    roleId: p.roleId,
    domainIds: p.domains.map((b) => b.id),
    departmentIds: p.departments.map((d) => d.id),
    active: p.active,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function getPersonByEmail(email: string) {
  return prisma.person.findUnique({
    where: { email },
    include: { role: true },
  });
}

export async function getDomains(): Promise<Domain[]> {
  const rows = await prisma.domain.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    focus: b.focus,
    domainType: b.domainType as "standard" | "no_clients",
    notes: b.notes ?? undefined,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function getDomainById(id: string): Promise<Domain | null> {
  const b = await prisma.domain.findUnique({ where: { id } });
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    focus: b.focus,
    domainType: b.domainType as "standard" | "no_clients",
    notes: b.notes ?? undefined,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function getDepartments(): Promise<Department[]> {
  const rows = await prisma.department.findMany();
  return rows.map((d) => ({
    id: d.id,
    domainId: d.domainId,
    name: d.name,
    isRestricted: d.isRestricted,
    restrictedReason: d.restrictedReason ?? undefined,
    successMetric: d.successMetric ?? undefined,
  }));
}

export async function getClients(): Promise<Client[]> {
  const rows = await prisma.client.findMany();
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    domainId: c.domainId,
    isOutOfDomain: c.isOutOfDomain,
    notes: c.notes ?? undefined,
  }));
}

function mapProject(p: any): Project {
  return {
    id: p.id,
    name: p.name,
    domainId: p.domainId,
    departmentId: p.departmentId ?? undefined,
    liveUrl: p.liveUrl ?? undefined,
    previewUrls: p.previewUrls ? JSON.parse(p.previewUrls) : undefined,
    hostingPlatform: p.hostingPlatform ?? undefined,
    hostingAccountLabel: p.externalAccount?.label ?? undefined,
    repoUrl: p.repoUrl ?? undefined,
    databaseRef: p.databaseRef ?? undefined,
    status: p.status,
    clientId: p.clientId ?? undefined,
    deliveryModel: p.deliveryModel ?? undefined,
    createdAt: p.createdAt.toISOString(),
    lastKnownUpdateAt: p.lastKnownUpdateAt.toISOString(),
    ownerPersonIds: (p.owners ?? []).map((o: any) => o.id),
    notes: p.notes ?? undefined,
    source: p.source,
    syncHistory: (p.syncStamps ?? []).map((s: any) => ({
      source: s.source,
      accountLabel: s.accountLabel,
      lastSeenAt: s.lastSeenAt.toISOString(),
      reachable: s.reachable,
    })),
  };
}

const projectInclude = {
  owners: true,
  syncStamps: true,
  externalAccount: true,
};

export async function getProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    include: projectInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapProject);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const p = await prisma.project.findUnique({
    where: { id },
    include: projectInclude,
  });
  return p ? mapProject(p) : null;
}

export async function getInboxAccounts(): Promise<InboxAccount[]> {
  const rows = await prisma.inboxAccount.findMany();
  return rows.map((a) => ({
    id: a.id,
    label: a.label,
    strategy: a.strategy as "polling" | "forwarding",
    linkedProjectId: a.linkedProjectId ?? undefined,
    connected: Boolean(a.googleRefreshToken),
  }));
}

export async function getInboxMessages(): Promise<InboxMessage[]> {
  const rows = await prisma.inboxMessage.findMany({
    orderBy: { receivedAt: "desc" },
  });
  return rows.map((m) => ({
    id: m.id,
    accountId: m.accountId,
    from: m.from,
    subject: m.subject,
    snippet: m.snippet,
    receivedAt: m.receivedAt.toISOString(),
    handled: m.handled,
    inferredProjectId: m.inferredProjectId ?? undefined,
  }));
}

export async function toggleInboxMessageHandled(id: string) {
  const msg = await prisma.inboxMessage.findUnique({ where: { id } });
  if (!msg) return null;
  return prisma.inboxMessage.update({
    where: { id },
    data: { handled: !msg.handled },
  });
}

export async function getProfitEntries(): Promise<ProfitEntry[]> {
  const rows = await prisma.profitEntry.findMany();
  return rows.map((e) => ({
    id: e.id,
    domainId: e.domainId,
    amount: e.amount,
    currency: e.currency,
    note: e.note,
    recordedAt: e.recordedAt.toISOString(),
    recordedByPersonId: e.recordedByPersonId,
    verified: "self_reported" as const,
  }));
}

export async function getDomainFocusNotes(): Promise<DomainFocusNote[]> {
  const rows = await prisma.domainFocusNote.findMany();
  return rows.map((n) => ({
    domainId: n.domainId,
    note: n.note,
    updatedAt: n.updatedAt.toISOString(),
    updatedByPersonId: n.updatedByPersonId,
  }));
}

export async function getAccessGrants(): Promise<AccessGrant[]> {
  const rows = await prisma.accessGrant.findMany();
  return rows.map((g) => ({
    id: g.id,
    personId: g.personId,
    targetType: g.targetType as "project" | "domain" | "department",
    targetId: g.targetId,
    level: g.level as "owner" | "editor" | "viewer",
    vaultReference: g.vaultReference ?? undefined,
    grantedAt: g.grantedAt.toISOString(),
    grantedByPersonId: g.grantedByPersonId,
    expiresAt: g.expiresAt?.toISOString(),
  }));
}

export async function getAuditLog(): Promise<AuditLogEntry[]> {
  const rows = await prisma.auditLogEntry.findMany({ orderBy: { at: "desc" } });
  return rows.map((a) => ({
    id: a.id,
    at: a.at.toISOString(),
    actorPersonId: a.actorPersonId,
    action: a.action,
    targetDescription: a.targetDescription,
    sensitive: a.sensitive,
  }));
}

export async function addAuditLogEntry(entry: {
  actorPersonId: string;
  action: string;
  targetDescription: string;
  sensitive: boolean;
}) {
  return prisma.auditLogEntry.create({ data: entry });
}

// LeadFlow is a separately deployed app backed by its own Supabase project
// (tables: leads, profiles — see FEATURES_TO_ADD.md). Production wiring: set
// LEADFLOW_SUPABASE_URL + LEADFLOW_SUPABASE_SERVICE_KEY. Falls back to the
// locally seeded LeadFlowLead rows when not configured, so the KDH branch
// view still renders something in dev.
export async function getLeadFlowLeads(): Promise<LeadFlowLead[]> {
  const supabaseUrl = process.env.LEADFLOW_SUPABASE_URL;
  const serviceKey = process.env.LEADFLOW_SUPABASE_SERVICE_KEY;
  if (supabaseUrl && serviceKey) {
    try {
      // PostgREST embedded resource: pulls each lead's employee full_name via the FK.
      const res = await fetch(
        `${supabaseUrl}/rest/v1/leads?select=id,customer_name,source,stage,created_at,profiles(full_name)&order=created_at.desc`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          cache: "no-store",
        },
      );
      if (!res.ok) throw new Error(`LeadFlow Supabase responded ${res.status}`);
      const rows = await res.json();
      return rows.map((l: any) => ({
        id: l.id,
        clientName: l.customer_name,
        source: l.source ?? undefined,
        status: l.stage,
        employeeName: l.profiles?.full_name ?? undefined,
        createdAt: l.created_at,
      }));
    } catch (err) {
      console.error(
        "LeadFlow Supabase fetch failed, falling back to local cache:",
        err,
      );
    }
  }
  const rows = await prisma.leadFlowLead.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map((l) => ({
    id: l.id,
    clientName: l.clientName,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
  }));
}

export async function getExternalAccounts() {
  const rows = await prisma.externalAccount.findMany({
    include: {
      owner: true,
      accessList: { include: { person: true } },
      projects: true,
      inboxAccounts: true,
    },
  });
  return rows.map((a) => ({
    id: a.id,
    platform: a.platform,
    label: a.label,
    vaultReference: a.vaultReference ?? undefined,
    owner: a.owner ? { id: a.owner.id, name: a.owner.name } : null,
    sharedWith: a.accessList.map((x) => ({
      id: x.person.id,
      name: x.person.name,
      grantedAt: x.grantedAt.toISOString(),
    })),
    projectNames: a.projects.map((p) => p.name),
    inboxLabels: a.inboxAccounts.map((i) => i.label),
  }));
}

// Naming-convention rules: matched against the incoming project name (case-insensitive).
// Add more { pattern, domainName } pairs as conventions emerge — first match wins.
const DOMAIN_NAME_RULES: { pattern: RegExp; domainName: string }[] = [
  { pattern: /\bkdh\b/i, domainName: "KDH (Kasur Digital Hub)" },
  { pattern: /\bremake/i, domainName: "Remakes Labs" },
  { pattern: /\bfiverr\b/i, domainName: "Fiverr" },
];

async function matchDomainByName(projectName: string): Promise<string | null> {
  const rule = DOMAIN_NAME_RULES.find((r) => r.pattern.test(projectName));
  if (!rule) return null;
  const domain = await prisma.domain.findFirst({
    where: { name: rule.domainName },
  });
  return domain?.id ?? null;
}

export async function upsertProjectFromSync(input: {
  name: string;
  domainId: string;
  status?: string;
  liveUrl?: string;
  repoUrl?: string;
  databaseRef?: string;
  hostingPlatform?: string;
  syncSource: string;
  accountLabel: string;
}) {
  // Naming-convention match takes priority over the caller's default (usually "Unassigned").
  const matchedDomainId = await matchDomainByName(input.name);
  const domainId = matchedDomainId ?? input.domainId;

  const existing = await prisma.project.findFirst({
    where: { name: { equals: input.name } },
  });
  const now = new Date();

  if (existing) {
    // Only move an existing project if it's still sitting in Unassigned — never override a human's manual assignment.
    const currentDomain = await prisma.domain.findUnique({
      where: { id: existing.domainId },
    });
    const shouldReassign =
      matchedDomainId && currentDomain?.name === "Unassigned";
    await prisma.project.update({
      where: { id: existing.id },
      data: {
        lastKnownUpdateAt: now,
        ...(input.status ? { status: input.status } : {}),
        ...(input.repoUrl ? { repoUrl: input.repoUrl } : {}),
        ...(input.databaseRef ? { databaseRef: input.databaseRef } : {}),
        ...(shouldReassign ? { domainId: matchedDomainId } : {}),
      },
    });
    const finalDomainId = shouldReassign ? matchedDomainId : existing.domainId;
    const stamp = await prisma.syncStamp.findFirst({
      where: { projectId: existing.id, source: input.syncSource },
    });
    if (stamp) {
      await prisma.syncStamp.update({
        where: { id: stamp.id },
        data: {
          lastSeenAt: now,
          reachable: true,
          accountLabel: input.accountLabel,
          assignedDomainId: finalDomainId,
        },
      });
    } else {
      await prisma.syncStamp.create({
        data: {
          projectId: existing.id,
          source: input.syncSource,
          accountLabel: input.accountLabel,
          lastSeenAt: now,
          reachable: true,
          assignedDomainId: finalDomainId,
        },
      });
    }
    return existing.id;
  }

  const created = await prisma.project.create({
    data: {
      name: input.name,
      domainId,
      // GitHub-only discovery tells us nothing about deployment state, so it
      // shouldn't default to "live" like a Vercel-originated project would.
      status: input.status ?? "in_development",
      liveUrl: input.liveUrl,
      repoUrl: input.repoUrl,
      databaseRef: input.databaseRef,
      hostingPlatform: input.hostingPlatform,
      source: "auto",
      createdAt: now,
      lastKnownUpdateAt: now,
      syncStamps: {
        create: [
          {
            source: input.syncSource,
            accountLabel: input.accountLabel,
            lastSeenAt: now,
            reachable: true,
            assignedDomainId: domainId,
          },
        ],
      },
    },
  });
  return created.id;
}

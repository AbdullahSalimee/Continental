import { requireCurrentUser } from "@/lib/session";
import { getDepartments, getAccessGrants, getLeadFlowLeads, getPeople, addAuditLogEntry } from "@/lib/store";
import { canSeeDepartment, isSuperadmin } from "@/lib/rbac";
import { timeAgo } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default async function LeadFlowPage() {
  const { person, role } = await requireCurrentUser();
  const departments = await getDepartments();
  const accessGrants = await getAccessGrants();
  const leadflowDept = departments.find((d) => d.name === "LeadFlow" && d.isRestricted)!;
  const canSee = canSeeDepartment(person, role, leadflowDept, accessGrants);

  // Real, server-side audit logging on VIEW, not just on grant/revoke — this
  // was the earlier gap: the PRD implies visibility itself is sensitive.
  // Every load of this page (granted or denied) writes a row here.
  await addAuditLogEntry({
    actorPersonId: person.id,
    action: canSee ? "view_leadflow" : "denied_leadflow_attempt",
    targetDescription: `${person.name} (${role.name}) ${canSee ? "viewed" : "was denied access to"} LeadFlow`,
    sensitive: true,
  });

  if (!canSee) {
    return (
      <div className="space-y-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-faint">KDH · Department (restricted)</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">LeadFlow</h1>
        </div>
        <div className="rounded-lg border border-restricted/30 bg-restricted/5 p-6 text-sm">
          <p className="font-mono text-xs uppercase tracking-wide text-restricted">Access restricted</p>
          <p className="mt-2 text-text-muted">
            {person.name} ({role.name}) does not have an active grant into LeadFlow. This data is visible only to
            superadmins by default, or to someone holding an explicit, time-boxed grant — never open by default.
            This attempt has been recorded in the audit log.
          </p>
        </div>
      </div>
    );
  }

  const leadFlowLeads = await getLeadFlowLeads();
  const people = await getPeople();
  const won = leadFlowLeads.filter((l) => l.status === "won").length;
  const total = leadFlowLeads.length;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-faint">KDH · Department (restricted)</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">LeadFlow</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Lead-finding and Facebook marketing for KDH. Your access here is enforced by your real, signed-in session — not a client-side toggle — and this view has just been recorded in the audit log.
        </p>
      </div>

      <div className="rounded-lg border border-signal/25 bg-signal/5 px-4 py-3 text-xs text-signal">
        Success here is measured by <strong>leads won</strong>, never raw lead volume: {won} won out of {total} total.
        {!isSuperadmin(role) && " You're viewing this under a temporary, audited grant."}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
              <th className="px-4 py-2.5 font-medium">Lead</th>
              <th className="px-4 py-2.5 font-medium">City</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {leadFlowLeads.map((l) => {
              const owner = people.find((p) => p.id === l.ownerPersonId);
              return (
                <tr key={l.id} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-3 font-medium text-text">{l.clientName}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {l.city}
                    {l.city !== "Kasur" && <span className="ml-1.5 rounded-full border border-signal/30 bg-signal/10 px-1.5 py-0.5 text-[10px] text-signal">out of domain</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 text-xs text-text-muted">{owner?.name}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-text-faint">{timeAgo(l.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

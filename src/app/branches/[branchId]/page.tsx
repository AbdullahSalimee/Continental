import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/session";
import {
  findBranch,
  branchProjects,
  branchActivePeople,
  branchProfitTotal,
  branchHealth,
  branchFocusNote,
  branchDepartments,
} from "@/lib/analytics";
import {
  getLeadFlowLeads,
  getAccessGrants,
  addAuditLogEntry,
  getClients,
  getBranches,
} from "@/lib/store";
import { canSeeDepartment } from "@/lib/rbac";
import { money, timeAgo } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import HealthDot from "@/components/HealthDot";
import BranchAssignSelect from "@/components/BranchAssignSelect";

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { person, role } = await requireCurrentUser();
  const { branchId } = await params;
  const branch = await findBranch(branchId);
  if (!branch) notFound();

  const [projs, activePeople, profit, healthInfo, focus, depts] =
    await Promise.all([
      branchProjects(branchId),
      branchActivePeople(branchId),
      branchProfitTotal(branchId),
      branchHealth(branchId),
      branchFocusNote(branchId),
      branchDepartments(branchId),
    ]);
  const { health, reason } = healthInfo;

  // Unassigned isn't a working branch — it's a holding pen for synced projects
  // that haven't been placed yet, so it gets its own assign-focused view
  // instead of the normal stats/team/clients layout.
  if (branch.name === "Unassigned") {
    const allBranches = (await getBranches()).filter(
      (b) => b.name !== "Unassigned",
    );
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/"
            className="text-xs text-text-faint hover:text-text-muted"
          >
            ← All branches
          </Link>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            {branch.name}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            Projects discovered by sync that haven't been placed on a real
            branch yet. Assigning one is the only manual step in the flow.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Last update</th>
                <th className="px-4 py-2.5 font-medium">Assign to</th>
              </tr>
            </thead>
            <tbody>
              {projs.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border-soft last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium text-text hover:text-live"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-faint">
                    {timeAgo(p.lastKnownUpdateAt)}
                  </td>
                  <td className="px-4 py-3">
                    <BranchAssignSelect
                      projectId={p.id}
                      currentBranchId={p.branchId}
                      branches={allBranches}
                    />
                  </td>
                </tr>
              ))}
              {projs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-xs text-text-faint"
                  >
                    Nothing waiting on assignment right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Fiverr hasn't launched yet — show a placeholder instead of an empty-looking
  // stats grid until there's actually something to report on.
  if (
    branch.name === "Fiverr" &&
    projs.length === 0 &&
    activePeople.length === 0
  ) {
    return (
      <div className="space-y-4">
        <div>
          <Link
            href="/"
            className="text-xs text-text-faint hover:text-text-muted"
          >
            ← All branches
          </Link>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            {branch.name}
          </h1>
        </div>
        <div className="rounded-lg border border-border-soft bg-panel/50 p-6 text-center">
          <p className="text-sm text-text-muted">
            {branch.focus || "Coming soon."}
          </p>
          <p className="mt-1 text-xs text-text-faint">
            This branch hasn't launched yet — nothing to report until it has
            projects or people.
          </p>
        </div>
      </div>
    );
  }

  const branchClients =
    branch.branchType === "no_clients"
      ? []
      : (await getClients()).filter((c) => c.branchId === branchId);

  // LeadFlow is a department of KDH, not a top-level page — embed it here,
  // gated by the same access-grant check the old standalone page used.
  const leadflowDept = depts.find(
    (d) => d.name === "LeadFlow" && d.isRestricted,
  );
  let leadflowSection = null;
  if (leadflowDept) {
    const accessGrants = await getAccessGrants();
    const canSee = canSeeDepartment(person, role, leadflowDept, accessGrants);
    await addAuditLogEntry({
      actorPersonId: person.id,
      action: canSee ? "view_leadflow" : "denied_leadflow_attempt",
      targetDescription: `${person.name} (${role.name}) ${canSee ? "viewed" : "was denied access to"} LeadFlow`,
      sensitive: true,
    });
    if (canSee) {
      const leads = await getLeadFlowLeads();
      const won = leads.filter((l) => l.status === "won").length;
      leadflowSection = { leads, won };
    } else {
      leadflowSection = { leads: null, won: 0 };
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/"
          className="text-xs text-text-faint hover:text-text-muted"
        >
          ← All branches
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {branch.name}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-text-muted">
              {branch.focus}
            </p>
          </div>
          <HealthDot health={health} />
        </div>
        <p className="mt-2 text-xs text-text-faint">Health: {reason}</p>
      </div>

      {branch.notes && (
        <div className="rounded-lg border border-border-soft bg-panel/60 p-4 text-sm text-text-muted">
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-faint">
            Business rules on record
          </span>
          <p className="mt-1.5 leading-relaxed">{branch.notes}</p>
        </div>
      )}

      {focus && (
        <div className="rounded-lg border border-signal/25 bg-signal/5 p-4 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-wide text-signal">
            Current focus / next action
          </span>
          <p className="mt-1.5 text-text">{focus}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-panel px-4 py-3">
          <div className="font-mono text-xl text-text">{projs.length}</div>
          <div className="text-[11px] text-text-faint">projects</div>
        </div>
        <div className="rounded-lg border border-border bg-panel px-4 py-3">
          <div className="font-mono text-xl text-text">
            {activePeople.length}
          </div>
          <div className="text-[11px] text-text-faint">active people</div>
        </div>
        <div className="rounded-lg border border-border bg-panel px-4 py-3">
          <div className="font-mono text-xl text-text">
            {money(profit.total, profit.currency)}
          </div>
          <div className="text-[11px] text-text-faint">
            self-reported profit
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-2 font-display text-sm font-semibold text-text-muted">
            Team
          </h2>
          <div className="flex flex-wrap gap-2">
            {activePeople.map((p) => (
              <span
                key={p.id}
                className="rounded-full border border-border bg-panel-2 px-3 py-1 text-xs text-text-muted"
              >
                {p.name}
              </span>
            ))}
            {activePeople.length === 0 && (
              <p className="text-xs text-text-faint">
                No active people assigned yet.
              </p>
            )}
          </div>
        </div>

        {branch.branchType !== "no_clients" && (
          <div>
            <h2 className="mb-2 font-display text-sm font-semibold text-text-muted">
              Clients
            </h2>
            <div className="flex flex-wrap gap-2">
              {branchClients.map((c) => (
                <span
                  key={c.id}
                  className="rounded-full border border-border bg-panel-2 px-3 py-1 text-xs text-text-muted"
                >
                  {c.name}
                  {c.isOutOfDomain && " · out-of-domain"}
                </span>
              ))}
              {branchClients.length === 0 && (
                <p className="text-xs text-text-faint">
                  No clients recorded yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {depts.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-sm font-semibold text-text-muted">
            Departments
          </h2>
          <div className="flex flex-wrap gap-2">
            {depts.map((d) => (
              <span
                key={d.id}
                className={`rounded-full border px-3 py-1 text-xs font-mono ${
                  d.isRestricted
                    ? "border-restricted/30 bg-restricted/10 text-restricted"
                    : "border-border bg-panel-2 text-text-muted"
                }`}
              >
                {d.name}
                {d.isRestricted && " · restricted"}
              </span>
            ))}
          </div>
        </div>
      )}

      {leadflowSection && (
        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-text-muted">
            LeadFlow
          </h2>
          {leadflowSection.leads === null ? (
            <div className="rounded-lg border border-restricted/30 bg-restricted/5 p-4 text-sm text-text-muted">
              This data is visible only to superadmins by default, or to someone
              holding an explicit grant. This attempt has been recorded in the
              audit log.
            </div>
          ) : (
            <>
              <div className="mb-2 rounded-lg border border-signal/25 bg-signal/5 px-4 py-2.5 text-xs text-signal">
                Success is measured by leads won: {leadflowSection.won} won out
                of {leadflowSection.leads.length} total.
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
                      <th className="px-4 py-2.5 font-medium">Lead</th>
                      <th className="px-4 py-2.5 font-medium">Source</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Employee</th>
                      <th className="px-4 py-2.5 font-medium">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadflowSection.leads.map((l) => (
                      <tr
                        key={l.id}
                        className="border-b border-border-soft last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-text">
                          {l.clientName}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {l.source ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={l.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {l.employeeName ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-text-faint">
                          {timeAgo(l.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-text-muted">
          Projects
        </h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Hosting</th>
                <th className="px-4 py-2.5 font-medium">Last update</th>
              </tr>
            </thead>
            <tbody>
              {projs.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border-soft last:border-0 hover:bg-panel-2/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium text-text hover:text-live"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {p.hostingPlatform ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-faint">
                    {timeAgo(p.lastKnownUpdateAt)}
                  </td>
                </tr>
              ))}
              {projs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-xs text-text-faint"
                  >
                    No projects recorded for this branch yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCurrentUser } from "@/lib/role-context";
import { people, roles, accessGrants, auditLog, projects, branches, departments } from "@/lib/store";
import { isSuperadmin } from "@/lib/rbac";
import { timeAgo } from "@/lib/format";

export default function AccessPage() {
  const { role } = useCurrentUser();
  const superadmin = isSuperadmin(role);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-faint">Module D</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Access &amp; Ownership Map</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Who can reach what — across branches, projects, and accounts. Raw credentials live in the shared vault; this only stores references.
        </p>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-text-muted">People &amp; roles</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Branches</th>
                <th className="px-4 py-2.5 font-medium">Direct grants</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const r = roles.find((r) => r.id === p.roleId)!;
                const grants = accessGrants.filter((g) => g.personId === p.id);
                return (
                  <tr key={p.id} className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text">{p.name}</div>
                      <div className="font-mono text-[11px] text-text-faint">{p.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-border bg-panel-2 px-2.5 py-0.5 text-[11px] font-mono text-text-muted">{r.name}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {p.branchIds.map((bid) => branches.find((b) => b.id === bid)?.name).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">{grants.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-text-muted">Access grants</h2>
        <div className="space-y-1.5">
          {accessGrants.map((g) => {
            const person = people.find((p) => p.id === g.personId);
            const targetLabel =
              g.targetType === "project"
                ? projects.find((p) => p.id === g.targetId)?.name
                : g.targetType === "branch"
                ? branches.find((b) => b.id === g.targetId)?.name
                : departments.find((d) => d.id === g.targetId)?.name;
            const restricted = g.targetType === "department" && departments.find((d) => d.id === g.targetId)?.isRestricted;
            const expired = g.expiresAt ? new Date(g.expiresAt).getTime() < Date.now() : false;

            return (
              <div
                key={g.id}
                className={`flex items-center justify-between rounded-md border px-3.5 py-2.5 text-xs ${
                  restricted ? "border-restricted/25 bg-restricted/5" : "border-border-soft bg-panel/50"
                }`}
              >
                <span className="text-text-muted">
                  <span className="text-text">{person?.name}</span> → {targetLabel}{" "}
                  <span className="font-mono text-text-faint">({g.targetType}, {g.level})</span>
                  {restricted && <span className="ml-2 font-mono text-restricted">LeadFlow</span>}
                </span>
                <span className="flex items-center gap-3">
                  {g.expiresAt && (
                    <span className={`font-mono ${expired ? "text-danger" : "text-signal"}`}>
                      {expired ? "expired" : `expires ${new Date(g.expiresAt).toLocaleDateString()}`}
                    </span>
                  )}
                  {g.vaultReference && <span className="font-mono text-text-faint">{g.vaultReference}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold text-text-muted">Audit log</h2>
          {!superadmin && (
            <span className="rounded-full border border-restricted/25 bg-restricted/5 px-2 py-0.5 text-[10px] font-mono text-restricted">
              superadmin only
            </span>
          )}
        </div>
        {superadmin ? (
          <div className="space-y-1.5">
            {auditLog.map((a) => {
              const actor = people.find((p) => p.id === a.actorPersonId);
              return (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-border-soft bg-panel/50 px-3.5 py-2.5 text-xs">
                  <span className="text-text-muted">
                    <span className="text-text">{actor?.name}</span> — {a.action.replace(/_/g, " ")}: {a.targetDescription}
                  </span>
                  <span className="font-mono text-text-faint">{timeAgo(a.at)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-md border border-border-soft bg-panel/50 px-3.5 py-3 text-xs text-text-faint">
            The audit log covers access grants and revocations, including LeadFlow exceptions. It's visible to superadmins only.
          </p>
        )}
      </div>
    </div>
  );
}

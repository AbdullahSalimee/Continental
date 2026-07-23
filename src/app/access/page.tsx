import { requireCurrentUser } from "@/lib/session";
import {
  getPeople,
  getRoles,
  getAccessGrants,
  getAuditLog,
  getProjects,
  getBranches,
  getDepartments,
  getExternalAccounts,
} from "@/lib/store";
import { isSuperadmin } from "@/lib/rbac";
import { timeAgo } from "@/lib/format";
import { addExternalAccountAction } from "@/app/actions";

export default async function AccessPage() {
  const { role } = await requireCurrentUser();
  const superadmin = isSuperadmin(role);

  const [
    people,
    roles,
    accessGrants,
    projects,
    branches,
    departments,
    externalAccounts,
  ] = await Promise.all([
    getPeople(),
    getRoles(),
    getAccessGrants(),
    getProjects(),
    getBranches(),
    getDepartments(),
    getExternalAccounts(),
  ]);
  const auditLog = superadmin ? await getAuditLog() : [];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-faint">
          Module D
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Access &amp; Ownership Map
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Who can reach what — across branches, projects, and the actual
          external logins behind them. Raw credentials live in the shared vault;
          this only stores references.
        </p>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-text-muted">
          People &amp; roles
        </h2>
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
                  <tr
                    key={p.id}
                    className="border-b border-border-soft last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-text">{p.name}</div>
                      <div className="font-mono text-[11px] text-text-faint">
                        {p.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-border bg-panel-2 px-2.5 py-0.5 text-[11px] font-mono text-text-muted">
                        {r.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {p.branchIds
                        .map((bid) => branches.find((b) => b.id === bid)?.name)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {grants.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold text-text-muted">
            External account logins
          </h2>
          <span className="rounded-full border border-info/25 bg-info/5 px-2 py-0.5 text-[10px] font-mono text-info">
            who actually holds this login
          </span>
        </div>
        <p className="mb-3 text-xs text-text-faint">
          This is the piece that used to be missing: not just in-app grants, but
          which Vercel/GitHub/Supabase/Google logins exist, who owns each one,
          and who else has been given the credentials.
        </p>

        {superadmin && (
          <form
            action={addExternalAccountAction}
            className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border-soft bg-panel/50 p-3"
          >
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-faint">
                Platform
              </label>
              <select
                name="platform"
                required
                className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text"
              >
                <option value="vercel">Vercel</option>
                <option value="github">GitHub</option>
                <option value="supabase">Supabase</option>
                <option value="google">Google</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-faint">
                Label
              </label>
              <input
                name="label"
                required
                placeholder="e.g. remake-labs+vercel1@gmail.com"
                className="w-56 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text outline-none focus:border-live/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-faint">
                Vault reference
              </label>
              <input
                name="vaultReference"
                placeholder="e.g. bitwarden://item/abc123"
                className="w-48 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text outline-none focus:border-live/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-faint">
                Owner
              </label>
              <select
                name="ownerPersonId"
                className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text"
              >
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md border border-live/30 bg-live/10 px-3 py-1.5 text-xs font-mono text-live transition-colors hover:bg-live/20"
            >
              Add account
            </button>
          </form>
        )}

        <div className="space-y-1.5">
          {externalAccounts.map((a) => (
            <div
              key={a.id}
              className="rounded-md border border-border-soft bg-panel/50 px-3.5 py-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-info">{a.platform}</span>
                <span className="font-mono text-text-faint">
                  {a.vaultReference ?? "no vault reference on file"}
                </span>
              </div>
              <div className="mt-1 text-text">{a.label}</div>
              <div className="mt-1 text-text-muted">
                Owner:{" "}
                <span className="text-text">
                  {a.owner?.name ?? "unrecorded"}
                </span>
                {a.sharedWith.length > 0 && (
                  <>
                    {" "}
                    · Also has this login:{" "}
                    {a.sharedWith.map((s) => s.name).join(", ")}
                  </>
                )}
              </div>
              {a.projectNames.length > 0 && (
                <div className="mt-1 text-text-faint">
                  Backs: {a.projectNames.join(", ")}
                </div>
              )}
            </div>
          ))}
          {externalAccounts.length === 0 && (
            <p className="text-xs text-text-faint">
              No external accounts recorded yet.
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-text-muted">
          In-app access grants
        </h2>
        <div className="space-y-1.5">
          {accessGrants.map((g) => {
            const person = people.find((p) => p.id === g.personId);
            const targetLabel =
              g.targetType === "project"
                ? projects.find((p) => p.id === g.targetId)?.name
                : g.targetType === "branch"
                  ? branches.find((b) => b.id === g.targetId)?.name
                  : departments.find((d) => d.id === g.targetId)?.name;
            const restricted =
              g.targetType === "department" &&
              departments.find((d) => d.id === g.targetId)?.isRestricted;
            const expired = g.expiresAt
              ? new Date(g.expiresAt).getTime() < Date.now()
              : false;

            return (
              <div
                key={g.id}
                className={`flex items-center justify-between rounded-md border px-3.5 py-2.5 text-xs ${
                  restricted
                    ? "border-restricted/25 bg-restricted/5"
                    : "border-border-soft bg-panel/50"
                }`}
              >
                <span className="text-text-muted">
                  <span className="text-text">{person?.name}</span> →{" "}
                  {targetLabel}{" "}
                  <span className="font-mono text-text-faint">
                    ({g.targetType}, {g.level})
                  </span>
                  {restricted && (
                    <span className="ml-2 font-mono text-restricted">
                      LeadFlow
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {g.expiresAt && (
                    <span
                      className={`font-mono ${expired ? "text-danger" : "text-signal"}`}
                    >
                      {expired
                        ? "expired"
                        : `expires ${new Date(g.expiresAt).toLocaleDateString()}`}
                    </span>
                  )}
                  {g.vaultReference && (
                    <span className="font-mono text-text-faint">
                      {g.vaultReference}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold text-text-muted">
            Audit log
          </h2>
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
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-border-soft bg-panel/50 px-3.5 py-2.5 text-xs"
                >
                  <span className="text-text-muted">
                    <span className="text-text">{actor?.name}</span> —{" "}
                    {a.action.replace(/_/g, " ")}: {a.targetDescription}
                    {a.sensitive && (
                      <span className="ml-2 font-mono text-restricted">
                        sensitive
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-text-faint">
                    {timeAgo(a.at)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-md border border-border-soft bg-panel/50 px-3.5 py-3 text-xs text-text-faint">
            The audit log covers access grants/revocations and every LeadFlow
            view (granted or denied). It's visible to superadmins only.
          </p>
        )}
      </div>
    </div>
  );
}

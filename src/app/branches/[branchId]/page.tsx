import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/session";
import { findBranch, branchProjects, branchActivePeople, branchProfitTotal, branchHealth, branchFocusNote, branchDepartments } from "@/lib/analytics";
import { money, timeAgo } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import HealthDot from "@/components/HealthDot";

export default async function BranchDetailPage({ params }: { params: Promise<{ branchId: string }> }) {
  await requireCurrentUser();
  const { branchId } = await params;
  const branch = await findBranch(branchId);
  if (!branch) notFound();

  const [projs, activePeople, profit, healthInfo, focus, depts] = await Promise.all([
    branchProjects(branchId),
    branchActivePeople(branchId),
    branchProfitTotal(branchId),
    branchHealth(branchId),
    branchFocusNote(branchId),
    branchDepartments(branchId),
  ]);
  const { health, reason } = healthInfo;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-xs text-text-faint hover:text-text-muted">← All branches</Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{branch.name}</h1>
            <p className="mt-1 max-w-xl text-sm text-text-muted">{branch.focus}</p>
          </div>
          <HealthDot health={health} />
        </div>
        <p className="mt-2 text-xs text-text-faint">Health: {reason}</p>
      </div>

      {branch.notes && (
        <div className="rounded-lg border border-border-soft bg-panel/60 p-4 text-sm text-text-muted">
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-faint">Business rules on record</span>
          <p className="mt-1.5 leading-relaxed">{branch.notes}</p>
        </div>
      )}

      {focus && (
        <div className="rounded-lg border border-signal/25 bg-signal/5 p-4 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-wide text-signal">Current focus / next action</span>
          <p className="mt-1.5 text-text">{focus}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-panel px-4 py-3">
          <div className="font-mono text-xl text-text">{projs.length}</div>
          <div className="text-[11px] text-text-faint">projects</div>
        </div>
        <div className="rounded-lg border border-border bg-panel px-4 py-3">
          <div className="font-mono text-xl text-text">{activePeople.length}</div>
          <div className="text-[11px] text-text-faint">active people</div>
        </div>
        <div className="rounded-lg border border-border bg-panel px-4 py-3">
          <div className="font-mono text-xl text-text">{money(profit.total, profit.currency)}</div>
          <div className="text-[11px] text-text-faint">self-reported profit</div>
        </div>
      </div>

      {depts.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-sm font-semibold text-text-muted">Departments</h2>
          <div className="flex flex-wrap gap-2">
            {depts.map((d) => (
              <span
                key={d.id}
                className={`rounded-full border px-3 py-1 text-xs font-mono ${
                  d.isRestricted ? "border-restricted/30 bg-restricted/10 text-restricted" : "border-border bg-panel-2 text-text-muted"
                }`}
              >
                {d.name}
                {d.isRestricted && " · restricted"}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-text-muted">Projects</h2>
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
                <tr key={p.id} className="border-b border-border-soft last:border-0 hover:bg-panel-2/60">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-text hover:text-live">{p.name}</Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{p.hostingPlatform ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-faint">{timeAgo(p.lastKnownUpdateAt)}</td>
                </tr>
              ))}
              {projs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-text-faint">No projects recorded for this branch yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

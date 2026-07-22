import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/session";
import { getProjectById, getBranches, getClients, getAccessGrants, getPeople } from "@/lib/store";
import { projectDrift } from "@/lib/analytics";
import { timeAgo, sourceLabel } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCurrentUser();
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  const [branches, clients, accessGrants, people] = await Promise.all([getBranches(), getClients(), getAccessGrants(), getPeople()]);
  const branch = branches.find((b) => b.id === project.branchId);
  const client = clients.find((c) => c.id === project.clientId);
  const owners = people.filter((p) => project.ownerPersonIds.includes(p.id));
  const grants = accessGrants.filter((g) => g.targetType === "project" && g.targetId === project.id);
  const drift = projectDrift(project);

  return (
    <div className="space-y-6">
      <Link href="/projects" className="text-xs text-text-faint hover:text-text-muted">← Registry</Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {branch?.name}{project.departmentId ? " · dept" : ""}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {drift.drifted && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          ⚠ Drift detector: {drift.reason}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Live URL" value={project.liveUrl} link={project.liveUrl} />
        <Field label="Repository" value={project.repoUrl} link={project.repoUrl} mono />
        <Field label="Hosting" value={project.hostingPlatform} />
        <Field label="Hosting account" value={project.hostingAccountLabel} mono />
        <Field label="Database" value={project.databaseRef} mono />
        <Field label="Client" value={client?.name} />
        <Field label="Delivery model" value={project.deliveryModel?.replace("_", "-")} />
        <Field label="Data source" value={project.source} />
        <Field label="Created" value={new Date(project.createdAt).toLocaleDateString()} />
        <Field label="Last known update" value={`${new Date(project.lastKnownUpdateAt).toLocaleDateString()} (${timeAgo(project.lastKnownUpdateAt)})`} />
      </div>

      {project.notes && (
        <div className="rounded-lg border border-border-soft bg-panel/60 p-4 text-sm text-text-muted">
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-faint">Notes</span>
          <p className="mt-1.5">{project.notes}</p>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-display text-sm font-semibold text-text-muted">Owners</h2>
        <div className="flex flex-wrap gap-2">
          {owners.map((o) => (
            <span key={o.id} className="rounded-full border border-border bg-panel-2 px-3 py-1 text-xs text-text-muted">{o.name}</span>
          ))}
          {owners.length === 0 && <span className="text-xs text-text-faint">No owner recorded.</span>}
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-display text-sm font-semibold text-text-muted">Access grants</h2>
        <div className="space-y-1.5">
          {grants.map((g) => {
            const person = people.find((p) => p.id === g.personId);
            return (
              <div key={g.id} className="flex items-center justify-between rounded-md border border-border-soft bg-panel/60 px-3 py-2 text-xs">
                <span className="text-text-muted">{person?.name} — <span className="font-mono">{g.level}</span></span>
                {g.vaultReference && <span className="font-mono text-text-faint">{g.vaultReference}</span>}
              </div>
            );
          })}
          {grants.length === 0 && <p className="text-xs text-text-faint">No explicit grants recorded — visibility follows default branch role rules.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-display text-sm font-semibold text-text-muted">Sync history</h2>
        <div className="space-y-1.5">
          {project.syncHistory.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-md border border-border-soft bg-panel/60 px-3 py-2 text-xs font-mono">
              <span className="text-info">{sourceLabel(s.source)}</span>
              <span className="text-text-muted">{s.accountLabel}</span>
              <span className={s.reachable === false ? "text-danger" : "text-live"}>
                {s.reachable === false ? "unreachable" : "reachable"}
              </span>
              <span className="text-text-faint">{timeAgo(s.lastSeenAt)}</span>
            </div>
          ))}
          {project.syncHistory.length === 0 && <p className="text-xs text-text-faint">Never auto-synced — manual entry only.</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, link, mono }: { label: string; value?: string; link?: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border-soft bg-panel/50 px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
      {value ? (
        link ? (
          <a href={link} target="_blank" rel="noreferrer" className={`mt-0.5 block truncate text-sm text-live hover:underline ${mono ? "font-mono" : ""}`}>
            {value}
          </a>
        ) : (
          <div className={`mt-0.5 truncate text-sm text-text ${mono ? "font-mono" : ""}`}>{value}</div>
        )
      ) : (
        <div className="mt-0.5 text-sm text-text-faint">—</div>
      )}
    </div>
  );
}

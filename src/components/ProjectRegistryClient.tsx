"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Branch, Client, Project } from "@/lib/types";
import { projectDrift } from "@/lib/analytics";
import { timeAgo, sourceLabel } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default function ProjectRegistryClient({
  projects,
  branches,
  clients,
}: {
  projects: Project[];
  branches: Branch[];
  clients: Client[];
}) {
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [driftOnly, setDriftOnly] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const statuses = useMemo(() => Array.from(new Set(projects.map((p) => p.status))), [projects]);

  const filtered = projects.filter((p) => {
    if (branchFilter !== "all" && p.branchId !== branchFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (driftOnly && !projectDrift(p).drifted) return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  async function runSync(source: "vercel" | "github" | "supabase") {
    setSyncing(source);
    setSyncMessage(null);
    try {
      const res = await fetch(`/api/sync/${source}`, { method: "POST" });
      const data = await res.json();
      setSyncMessage(data.message ?? `${source} sync triggered.`);
    } catch {
      setSyncMessage(`Could not reach the ${source} sync job.`);
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          className="w-48 rounded-md border border-border bg-panel px-3 py-1.5 text-sm outline-none focus:border-live/50"
        />
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-text-muted"
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-text-muted"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button
          onClick={() => setDriftOnly((v) => !v)}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            driftOnly ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-panel text-text-muted hover:text-text"
          }`}
        >
          Drift detector{driftOnly ? " ✓" : ""}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {(["vercel", "github", "supabase"] as const).map((s) => (
            <button
              key={s}
              onClick={() => runSync(s)}
              disabled={syncing !== null}
              className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-xs font-mono text-text-muted transition-colors hover:text-text disabled:opacity-50"
            >
              {syncing === s ? "syncing…" : `sync ${s}`}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {syncMessage && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-md border border-live/25 bg-live/5 px-3 py-2 text-xs text-live"
          >
            {syncMessage}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
              <th className="px-4 py-2.5 font-medium">Project</th>
              <th className="px-4 py-2.5 font-medium">Branch</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Last confirmed</th>
              <th className="px-4 py-2.5 font-medium">Drift</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const branch = branches.find((b) => b.id === p.branchId);
              const client = clients.find((c) => c.id === p.clientId);
              const drift = projectDrift(p);
              const lastSync = p.syncHistory[0];
              return (
                <tr key={p.id} className="border-b border-border-soft last:border-0 hover:bg-panel-2/60">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-text hover:text-live">{p.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{branch?.name ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-xs text-text-muted">{client?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-text-faint">
                    {lastSync ? sourceLabel(lastSync.source) : "manual only"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-text-faint">{timeAgo(p.lastKnownUpdateAt)}</td>
                  <td className="px-4 py-3">
                    {drift.drifted ? (
                      <span className="text-[11px] font-mono text-danger" title={drift.reason ?? undefined}>⚠ flagged</span>
                    ) : (
                      <span className="text-[11px] font-mono text-text-faint">clear</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-text-faint">No projects match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Branch, Client, Project } from "@/lib/types";
import { projectDrift } from "@/lib/analytics";
import { timeAgo, sourceLabel } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { updateProjectBranchAction } from "@/app/actions";

type DiscoveredRow = {
  name: string;
  sources: string[]; // e.g. ["vercel", "github"] — merged if found in multiple feeds
  accountLabels: string[];
  status?: string;
  liveUrl?: string;
  repoUrl?: string;
  databaseRef?: string;
};

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
  const [movingId, setMovingId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMessage, setDiscoverMessage] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredRow[] | null>(null);

  async function moveProject(projectId: string, branchId: string) {
    setMovingId(projectId);
    try {
      await updateProjectBranchAction(projectId, branchId);
    } finally {
      setMovingId(null);
    }
  }

  const statuses = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status))),
    [projects],
  );

  const filtered = projects.filter((p) => {
    if (branchFilter !== "all" && p.branchId !== branchFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (driftOnly && !projectDrift(p).drifted) return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  // Single "Discover" action replaces the three separate sync buttons — runs
  // all three feeds in parallel and merges what each one found by project
  // name, so a project seen in both Vercel and GitHub shows as one row.
  async function runDiscover() {
    setDiscovering(true);
    setDiscoverMessage(null);
    setDiscovered(null);
    try {
      const [vercelRes, githubRes, supabaseRes] = await Promise.all(
        (["vercel", "github", "supabase"] as const).map((s) =>
          fetch(`/api/sync/${s}`, { method: "POST" })
            .then((r) => r.json())
            .catch(() => ({
              ok: false,
              message: `Could not reach the ${s} sync job.`,
              discovered: [],
            })),
        ),
      );

      const merged = new Map<string, DiscoveredRow>();
      const mergeIn = (source: string, items: any[]) => {
        for (const item of items ?? []) {
          const row: DiscoveredRow = merged.get(item.name) ?? {
            name: item.name,
            sources: [],
            accountLabels: [],
          };
          row.sources.push(source);
          const account = item.accountLabel ?? item.organizationId;
          if (account && !row.accountLabels.includes(account))
            row.accountLabels.push(account);
          if (item.status) row.status = item.status;
          if (item.liveUrl) row.liveUrl = item.liveUrl;
          if (item.repoUrl) row.repoUrl = item.repoUrl;
          if (item.databaseRef) row.databaseRef = item.databaseRef;
          merged.set(item.name, row);
        }
      };
      mergeIn("vercel", vercelRes.discovered);
      mergeIn("github", githubRes.discovered);
      mergeIn("supabase", supabaseRes.discovered);

      setDiscovered(Array.from(merged.values()));
      const messages = [
        vercelRes.message,
        githubRes.message,
        supabaseRes.message,
      ].filter(Boolean);
      setDiscoverMessage(messages.join(" "));
    } catch {
      setDiscoverMessage(
        "Discovery failed — could not reach one or more sync jobs.",
      );
    } finally {
      setDiscovering(false);
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
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-text-muted"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button
          onClick={() => setDriftOnly((v) => !v)}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            driftOnly
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border bg-panel text-text-muted hover:text-text"
          }`}
        >
          Drift detector{driftOnly ? " ✓" : ""}
        </button>

        <div className="ml-auto">
          <button
            onClick={runDiscover}
            disabled={discovering}
            className="rounded-md border border-live/30 bg-live/10 px-3 py-1.5 text-xs font-mono text-live transition-colors hover:bg-live/20 disabled:opacity-50"
          >
            {discovering ? "discovering…" : "Discover projects"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {discoverMessage && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-md border border-live/25 bg-live/5 px-3 py-2 text-xs text-live"
          >
            {discoverMessage}
          </motion.p>
        )}
      </AnimatePresence>

      {discovered && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Discovered from</th>
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Links</th>
                <th className="px-4 py-2.5 font-medium">Branch</th>
              </tr>
            </thead>
            <tbody>
              {discovered.map((d) => {
                const proj = projects.find((p) => p.name === d.name);
                return (
                  <tr
                    key={d.name}
                    className="border-b border-border-soft last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-text">
                      {d.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-text-faint">
                      {d.sources.join(", ")}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-text-faint">
                      {d.accountLabels.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {d.status ? <StatusBadge status={d.status} /> : "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-text-faint">
                      {d.liveUrl && (
                        <a
                          href={d.liveUrl}
                          target="_blank"
                          className="mr-2 hover:text-live"
                        >
                          live
                        </a>
                      )}
                      {d.repoUrl && (
                        <a
                          href={d.repoUrl}
                          target="_blank"
                          className="mr-2 hover:text-live"
                        >
                          repo
                        </a>
                      )}
                      {d.databaseRef && <span>{d.databaseRef}</span>}
                      {!d.liveUrl && !d.repoUrl && !d.databaseRef && "—"}
                    </td>
                    <td className="px-4 py-3">
                      {proj ? (
                        <select
                          value={proj.branchId ?? ""}
                          disabled={movingId === proj.id}
                          onChange={(e) => moveProject(proj.id, e.target.value)}
                          className="rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-text-muted outline-none focus:border-live/50 disabled:opacity-50"
                        >
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {discovered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-xs text-text-faint"
                  >
                    Nothing new discovered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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
              const client = clients.find((c) => c.id === p.clientId);
              const drift = projectDrift(p);
              const lastSync = p.syncHistory[0];
              return (
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
                    <select
                      value={p.branchId ?? ""}
                      disabled={movingId === p.id}
                      onChange={(e) => moveProject(p.id, e.target.value)}
                      className="rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-text-muted outline-none focus:border-live/50 disabled:opacity-50"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {branches.find((b) => b.id === p.branchId)?.branchType ===
                    "no_clients"
                      ? "—"
                      : (client?.name ?? "—")}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-text-faint">
                    {lastSync ? sourceLabel(lastSync.source) : "manual only"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-text-faint">
                    {timeAgo(p.lastKnownUpdateAt)}
                  </td>
                  <td className="px-4 py-3">
                    {drift.drifted ? (
                      <span
                        className="text-[11px] font-mono text-danger"
                        title={drift.reason ?? undefined}
                      >
                        ⚠ flagged
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-text-faint">
                        clear
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-xs text-text-faint"
                >
                  No projects match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

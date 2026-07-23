"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { Branch, Client, Project } from "@/lib/types";
import { projectDrift } from "@/lib/analytics";
import { timeAgo, sourceLabel } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { updateProjectBranchAction } from "@/app/actions";

type DiscoveredItem = {
  id: string;
  source: "vercel" | "github" | "supabase";
  name: string;
  accountLabel: string;
  url?: string;
  status?: string;
  description?: string;
  language?: string;
  databaseRef?: string;
};

// One row per pending AIDecision returned by /api/discover: either "match"
// (creates/merges a project), "assign_branch", "suggest_status", or
// "suggest_description". Rendered generically since the shape only differs
// in `suggestion`'s fields.
type DecisionRow = {
  id: string;
  action: "match" | "assign_branch" | "suggest_status" | "suggest_description";
  items: DiscoveredItem[];
  suggestion: {
    suggestedName?: string;
    suggestedBranchName?: string;
    suggestedStatus?: string;
    suggestedDescription?: string;
  };
  reasoning?: string | null;
  confidence: number;
  method: string;
};

function decisionLabel(d: DecisionRow): string {
  switch (d.action) {
    case "match":
      return d.items.length > 1
        ? `Merge into "${d.suggestion.suggestedName}"`
        : `Add "${d.suggestion.suggestedName}"`;
    case "assign_branch":
      return `Assign to ${d.suggestion.suggestedBranchName}`;
    case "suggest_status":
      return `Set status: ${d.suggestion.suggestedStatus}`;
    case "suggest_description":
      return `Set description: ${d.suggestion.suggestedDescription}`;
  }
}

export default function ProjectRegistryClient({
  projects,
  branches,
  clients,
}: {
  projects: Project[];
  branches: Branch[];
  clients: Client[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [driftOnly, setDriftOnly] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMessage, setDiscoverMessage] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[] | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

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

  // Single "Discover" action: POST /api/discover, which fetches Vercel +
  // GitHub + Supabase in parallel, reconciles cross-source duplicates
  // (exact/fuzzy name match, then AI for the rest), and returns every
  // pending suggestion for review below. Nothing touches the Project table
  // until a decision is explicitly approved via applyDecisions().
  async function runDiscover() {
    setDiscovering(true);
    setDiscoverMessage(null);
    try {
      const res = await fetch("/api/discover", { method: "POST" });
      const data = await res.json();
      setDiscoverMessage(
        data.message ?? (data.ok ? "Discover finished." : "Discover failed."),
      );
      setDecisions(data.decisions ?? []);
    } catch {
      setDiscoverMessage("Discovery failed — could not reach /api/discover.");
    } finally {
      setDiscovering(false);
    }
  }

  async function applyDecisions(ids: string[]) {
    if (ids.length === 0) return;
    setBusyIds((prev) => new Set([...prev, ...ids]));
    try {
      const res = await fetch("/api/discover/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionIds: ids }),
      });
      const data = await res.json();
      setDiscoverMessage(data.message);
      setDecisions((prev) => (prev ?? []).filter((d) => !ids.includes(d.id)));
      // Refetches this route's server components so the registry table below
      // (and branch dashboards) reflect newly-created/updated projects
      // immediately, without the founder needing a hard refresh.
      router.refresh();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  async function rejectDecisions(ids: string[]) {
    if (ids.length === 0) return;
    setBusyIds((prev) => new Set([...prev, ...ids]));
    try {
      const res = await fetch("/api/discover/apply", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionIds: ids }),
      });
      const data = await res.json();
      setDiscoverMessage(data.message);
      setDecisions((prev) => (prev ?? []).filter((d) => !ids.includes(d.id)));
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
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

      {decisions && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border bg-panel-2 px-4 py-2">
            <p className="text-xs text-text-faint">
              {decisions.length} pending suggestion{decisions.length === 1 ? "" : "s"} — review before anything is saved.
            </p>
            {decisions.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => rejectDecisions(decisions.map((d) => d.id))}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted hover:text-text"
                >
                  Reject all
                </button>
                <button
                  onClick={() => applyDecisions(decisions.map((d) => d.id))}
                  className="rounded-md border border-live/30 bg-live/10 px-2.5 py-1 text-xs text-live hover:bg-live/20"
                >
                  Apply all
                </button>
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
                <th className="px-4 py-2.5 font-medium">Item(s)</th>
                <th className="px-4 py-2.5 font-medium">Discovered from</th>
                <th className="px-4 py-2.5 font-medium">Suggestion</th>
                <th className="px-4 py-2.5 font-medium">Confidence</th>
                <th className="px-4 py-2.5 font-medium">Reasoning</th>
                <th className="px-4 py-2.5 font-medium">Review</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => {
                const isBusy = busyIds.has(d.id);
                return (
                  <tr
                    key={d.id}
                    className="border-b border-border-soft last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-text">
                      {d.items.map((i) => i.name).join(" + ")}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-text-faint">
                      {Array.from(new Set(d.items.map((i) => i.source))).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-text">
                      {decisionLabel(d)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-text-faint">
                      {Math.round(d.confidence * 100)}%
                      {d.method === "ai" && <span className="ml-1 text-live/70">ai</span>}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-text-faint">
                      {d.reasoning ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => applyDecisions([d.id])}
                          disabled={isBusy}
                          className="rounded-md border border-live/30 bg-live/10 px-2 py-1 text-[11px] text-live hover:bg-live/20 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectDecisions([d.id])}
                          disabled={isBusy}
                          className="rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:text-text disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {decisions.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-xs text-text-faint"
                  >
                    Nothing new discovered — every synced item already matches the registry.
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

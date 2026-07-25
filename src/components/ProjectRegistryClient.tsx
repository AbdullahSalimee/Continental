"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { Domain, Client, Project } from "@/lib/types";
import { projectDrift } from "@/lib/analytics";
import { timeAgo, sourceLabel } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { updateProjectDomainAction } from "@/app/actions";

export default function ProjectRegistryClient({
  projects,
  domains,
  clients,
}: {
  projects: Project[];
  domains: Domain[];
  clients: Client[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [driftOnly, setDriftOnly] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMessage, setDiscoverMessage] = useState<string | null>(null);
  const [discoverDecisions, setDiscoverDecisions] = useState<
    Array<{
      action: string;
      status: string;
      method: string;
      confidence: number;
      reasoning: string | null;
      sourceItems: string[];
      resultingProjectId: string | null;
      resultingProjectName: string | null;
    }>
  >([]);

  async function moveProject(projectId: string, domainId: string) {
    setMovingId(projectId);
    try {
      await updateProjectDomainAction(projectId, domainId);
    } finally {
      setMovingId(null);
    }
  }

  const statuses = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status))),
    [projects],
  );

  const filtered = projects.filter((p) => {
    if (domainFilter !== "all" && p.domainId !== domainFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (driftOnly && !projectDrift(p).drifted) return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  // Fully automated: fetches Vercel + GitHub + Supabase + Netlify,
  // reconciles cross-source duplicates (exact/fuzzy, then AI for the
  // rest), and applies every resulting decision immediately -- no review
  // step. The registry table below refreshes right after.
  async function runDiscover() {
    setDiscovering(true);
    setDiscoverMessage(null);
    setDiscoverDecisions([]);
    try {
      const res = await fetch("/api/discover", { method: "POST" });
      const data = await res.json();
      setDiscoverMessage(
        data.message ?? (data.ok ? "Discover finished." : "Discover failed."),
      );
      setDiscoverDecisions(data.decisions ?? []);
      router.refresh();
    } catch {
      setDiscoverMessage("Discovery failed — could not reach /api/discover.");
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
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-text-muted"
        >
          <option value="all">All domains</option>
          {domains.map((b) => (
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

      {/* What just happened, broken out by what actually matters to look
          at: merges (2+ items combined -- these are the ones worth a
          second glance since a wrong merge is the costly failure mode),
          new standalone items, and anything that errored applying. */}
      {discoverDecisions.length > 0 && (
        <div className="rounded-lg border border-border-soft bg-panel/60 p-3 text-xs">
          {(() => {
            const merges = discoverDecisions.filter(
              (d) => d.sourceItems.length > 1 || d.action === "attach_existing",
            );
            const newStandalone = discoverDecisions.filter(
              (d) =>
                d.action === "match" &&
                d.sourceItems.length <= 1 &&
                d.method === "standalone",
            );
            const failed = discoverDecisions.filter(
              (d) => d.status !== "accepted",
            );
            return (
              <div className="space-y-3">
                {merges.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-mono uppercase tracking-wide text-text-faint">
                      Merged ({merges.length})
                    </div>
                    <div className="space-y-1">
                      {merges.map((d, i) => (
                        <div
                          key={i}
                          className="rounded border border-border-soft bg-panel px-2.5 py-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-text">
                              {d.sourceItems.join("  +  ") || "(new item)"}
                            </span>
                            <span
                              className={`font-mono ${d.confidence >= 0.9 ? "text-live" : d.confidence >= 0.7 ? "text-warn" : "text-text-faint"}`}
                            >
                              {d.method} · {d.confidence.toFixed(2)}
                            </span>
                          </div>
                          {d.resultingProjectName && (
                            <div className="mt-0.5 text-text-muted">
                              →{" "}
                              <span className="font-mono">
                                {d.resultingProjectName}
                              </span>
                            </div>
                          )}
                          {d.reasoning && (
                            <div className="mt-0.5 text-text-faint">
                              {d.reasoning}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {newStandalone.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-mono uppercase tracking-wide text-text-faint">
                      New, no match found ({newStandalone.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {newStandalone.map((d, i) => (
                        <span
                          key={i}
                          className="rounded border border-border-soft bg-panel px-2 py-1 font-mono text-text-muted"
                        >
                          {d.resultingProjectName ??
                            d.sourceItems[0] ??
                            "unknown"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {failed.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-mono uppercase tracking-wide text-danger">
                      Not applied ({failed.length})
                    </div>
                    <div className="space-y-1">
                      {failed.map((d, i) => (
                        <div
                          key={i}
                          className="rounded border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-danger"
                        >
                          {d.sourceItems.join(", ")} — {d.action} ({d.status})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-panel-2 text-left text-xs text-text-faint">
              <th className="px-4 py-2.5 font-medium">Project</th>
              <th className="px-4 py-2.5 font-medium">Domain</th>
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
                      value={p.domainId ?? ""}
                      disabled={movingId === p.id}
                      onChange={(e) => moveProject(p.id, e.target.value)}
                      className="rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-text-muted outline-none focus:border-live/50 disabled:opacity-50"
                    >
                      {domains.map((b) => (
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
                    {domains.find((b) => b.id === p.domainId)?.domainType ===
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

import { branches, departments, people, profitEntries, projects, branchFocusNotes } from "./store";
import type { Branch, Project } from "./types";

const STALE_DAYS = 60;

export function branchProjects(branchId: string): Project[] {
  return projects.filter((p) => p.branchId === branchId);
}

export function branchActivePeople(branchId: string) {
  return people.filter((p) => p.active && p.branchIds.includes(branchId));
}

export function branchProfitTotal(branchId: string) {
  const entries = profitEntries.filter((e) => e.branchId === branchId);
  // Note: naive same-currency sum for the demo. A real build should normalize
  // currency before summing, or show per-currency subtotals instead of one figure.
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const currency = entries[0]?.currency ?? "PKR";
  return { total, currency, entries };
}

export function branchFocusNote(branchId: string) {
  return branchFocusNotes.find((n) => n.branchId === branchId)?.note ?? null;
}

export type BranchHealth = "on_track" | "needs_attention" | "stale";

export function branchHealth(branchId: string): { health: BranchHealth; reason: string } {
  const projs = branchProjects(branchId);
  const brokenCount = projs.filter((p) => p.status === "broken").length;
  const staleCount = projs.filter((p) => {
    const days = (Date.now() - new Date(p.lastKnownUpdateAt).getTime()) / 86400000;
    return days > STALE_DAYS && p.status !== "archived" && p.status !== "decommissioned";
  }).length;

  if (brokenCount > 0) {
    return { health: "needs_attention", reason: `${brokenCount} project${brokenCount > 1 ? "s" : ""} reported broken` };
  }
  if (staleCount > 0) {
    return { health: "stale", reason: `${staleCount} project${staleCount > 1 ? "s" : ""} untouched 60+ days` };
  }
  return { health: "on_track", reason: "No broken or stale projects detected" };
}

export function continentalRollup() {
  const totalProjects = projects.length;
  const totalActivePeople = people.filter((p) => p.active).length;
  const totalProfitPKR = profitEntries
    .filter((e) => e.currency === "PKR")
    .reduce((s, e) => s + e.amount, 0);
  const totalProfitUSD = profitEntries
    .filter((e) => e.currency === "USD")
    .reduce((s, e) => s + e.amount, 0);

  return { totalProjects, totalActivePeople, totalProfitPKR, totalProfitUSD, branches };
}

export function projectDrift(p: Project): { drifted: boolean; reason: string | null } {
  if (p.status === "archived" || p.status === "decommissioned" || p.status === "demo_only") {
    return { drifted: false, reason: null };
  }
  const unreachableSync = p.syncHistory.find((s) => s.reachable === false);
  if (unreachableSync) {
    return { drifted: true, reason: `${unreachableSync.source.replace("_api", "")} last confirmed unreachable ${new Date(unreachableSync.lastSeenAt).toLocaleDateString()}` };
  }
  const days = (Date.now() - new Date(p.lastKnownUpdateAt).getTime()) / 86400000;
  if (days > STALE_DAYS) {
    return { drifted: true, reason: `No confirmed activity in ${Math.round(days)} days` };
  }
  return { drifted: false, reason: null };
}

export function branchDepartments(branchId: string) {
  return departments.filter((d) => d.branchId === branchId);
}

export function findBranch(id: string): Branch | undefined {
  return branches.find((b) => b.id === id);
}

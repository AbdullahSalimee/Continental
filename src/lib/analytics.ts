import {
  getBranches,
  getDepartments,
  getPeople,
  getProfitEntries,
  getProjects,
  getBranchFocusNotes,
} from "./store";
import type { Branch, Project } from "./types";

const STALE_DAYS = 60;

export async function branchProjects(branchId: string): Promise<Project[]> {
  const projects = await getProjects();
  return projects.filter((p) => p.branchId === branchId);
}

export async function branchActivePeople(branchId: string) {
  const people = await getPeople();
  return people.filter((p) => p.active && p.branchIds.includes(branchId));
}

export async function branchProfitTotal(branchId: string) {
  const profitEntries = await getProfitEntries();
  const entries = profitEntries.filter((e) => e.branchId === branchId);
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const currency = entries[0]?.currency ?? "PKR";
  return { total, currency, entries };
}

export async function branchFocusNote(branchId: string) {
  const notes = await getBranchFocusNotes();
  return notes.find((n) => n.branchId === branchId)?.note ?? null;
}

export type BranchHealth = "on_track" | "needs_attention" | "stale";

export async function branchHealth(branchId: string): Promise<{ health: BranchHealth; reason: string }> {
  const projs = await branchProjects(branchId);
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

export async function continentalRollup() {
  const [projects, people, profitEntries, branches] = await Promise.all([
    getProjects(),
    getPeople(),
    getProfitEntries(),
    getBranches(),
  ]);
  const totalProjects = projects.length;
  const totalActivePeople = people.filter((p) => p.active).length;
  const totalProfitPKR = profitEntries.filter((e) => e.currency === "PKR").reduce((s, e) => s + e.amount, 0);
  const totalProfitUSD = profitEntries.filter((e) => e.currency === "USD").reduce((s, e) => s + e.amount, 0);

  return { totalProjects, totalActivePeople, totalProfitPKR, totalProfitUSD, branches };
}

export function projectDrift(p: Project): { drifted: boolean; reason: string | null } {
  if (p.status === "archived" || p.status === "decommissioned" || p.status === "demo_only") {
    return { drifted: false, reason: null };
  }
  const unreachableSync = p.syncHistory.find((s) => s.reachable === false);
  if (unreachableSync) {
    return {
      drifted: true,
      reason: `${unreachableSync.source.replace("_api", "")} last confirmed unreachable ${new Date(unreachableSync.lastSeenAt).toLocaleDateString()}`,
    };
  }
  const days = (Date.now() - new Date(p.lastKnownUpdateAt).getTime()) / 86400000;
  if (days > STALE_DAYS) {
    return { drifted: true, reason: `No confirmed activity in ${Math.round(days)} days` };
  }
  return { drifted: false, reason: null };
}

export async function branchDepartments(branchId: string) {
  const departments = await getDepartments();
  return departments.filter((d) => d.branchId === branchId);
}

export async function findBranch(id: string): Promise<Branch | undefined> {
  const branches = await getBranches();
  return branches.find((b) => b.id === id);
}

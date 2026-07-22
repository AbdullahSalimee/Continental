import { projects, branches, clients } from "@/lib/store";
import ProjectRegistryClient from "@/components/ProjectRegistryClient";
import SyncTicker from "@/components/SyncTicker";

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-faint">Module A</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Project Registry</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Every product across every branch. Synced from Vercel, GitHub, and Supabase; manual entries fill the gaps automation can&apos;t reach.
        </p>
      </div>

      <SyncTicker />

      <ProjectRegistryClient projects={projects} branches={branches} clients={clients} />
    </div>
  );
}

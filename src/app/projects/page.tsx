import { requireCurrentUser } from "@/lib/session";
import { getProjects, getDomains, getClients } from "@/lib/store";
import ProjectRegistryClient from "@/components/ProjectRegistryClient";
import SyncTicker from "@/components/SyncTicker";

export default async function ProjectsPage() {
  await requireCurrentUser();
  const [projects, domains, clients] = await Promise.all([getProjects(), getDomains(), getClients()]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-faint">Module A</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Project Registry</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Every product across every domain. Synced from Vercel, GitHub, and Supabase; manual entries fill the gaps automation can&apos;t reach.
        </p>
      </div>

      <SyncTicker />

      <ProjectRegistryClient projects={projects} domains={domains} clients={clients} />
    </div>
  );
}

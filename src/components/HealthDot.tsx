import type { DomainHealth } from "@/lib/analytics";

const CONFIG: Record<DomainHealth, { color: string; label: string }> = {
  on_track: { color: "bg-live", label: "On track" },
  needs_attention: { color: "bg-danger", label: "Needs attention" },
  stale: { color: "bg-signal", label: "Stale" },
};

export default function HealthDot({ health }: { health: DomainHealth }) {
  const { color, label } = CONFIG[health];
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-soft bg-panel-2 px-2.5 py-1">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <span className="text-[11px] font-mono text-text-muted">{label}</span>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  live: "text-live border-live/30 bg-live/10",
  won: "text-live border-live/30 bg-live/10",
  in_development: "text-info border-info/30 bg-info/10",
  negotiating: "text-info border-info/30 bg-info/10",
  contacted: "text-info border-info/30 bg-info/10",
  new: "text-signal border-signal/30 bg-signal/10",
  demo_only: "text-signal border-signal/30 bg-signal/10",
  broken: "text-danger border-danger/30 bg-danger/10",
  lost: "text-danger border-danger/30 bg-danger/10",
  archived: "text-text-faint border-border bg-panel-2",
  decommissioned: "text-text-faint border-border bg-panel-2",
};

function fallback(status: string) {
  // Any status not in the map above still renders sensibly — the status
  // list is meant to be editable/extensible, not a fixed enum.
  return "text-text-muted border-border bg-panel-2";
}

export default function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? fallback(status);
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

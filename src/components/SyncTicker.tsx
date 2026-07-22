import { projects } from "@/lib/store";
import { timeAgo, sourceLabel } from "@/lib/format";

interface TickerItem {
  key: string;
  projectName: string;
  source: string;
  accountLabel: string;
  lastSeenAt: string;
  reachable: boolean | null;
}

function collectTickerItems(): TickerItem[] {
  const items: TickerItem[] = [];
  for (const p of projects) {
    for (const s of p.syncHistory) {
      items.push({
        key: `${p.id}-${s.source}`,
        projectName: p.name,
        source: s.source,
        accountLabel: s.accountLabel,
        lastSeenAt: s.lastSeenAt,
        reachable: s.reachable,
      });
    }
  }
  return items.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

export default function SyncTicker() {
  const items = collectTickerItems();
  if (items.length === 0) return null;
  const loop = [...items, ...items]; // duplicated for seamless CSS loop

  return (
    <div className="relative overflow-hidden rounded-lg border border-border-soft bg-panel/60">
      <div className="flex items-center gap-2 border-b border-border-soft px-4 py-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-live" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
        </span>
        <span className="text-[11px] font-mono uppercase tracking-wider text-text-faint">
          Live sync telemetry — automation feed, not a manual log
        </span>
      </div>
      <div className="scrollbar-thin overflow-hidden py-2.5">
        <div className="ticker-track flex w-max gap-6 px-4">
          {loop.map((item, i) => (
            <div key={`${item.key}-${i}`} className="flex shrink-0 items-center gap-2 text-xs font-mono whitespace-nowrap">
              <span className={`h-1.5 w-1.5 rounded-full ${item.reachable === false ? "bg-danger" : "bg-live"}`} />
              <span className="text-text">{item.projectName}</span>
              <span className="text-text-faint">·</span>
              <span className="text-info">{sourceLabel(item.source)}</span>
              <span className="text-text-faint">·</span>
              <span className="text-text-muted">{item.accountLabel}</span>
              <span className="text-text-faint">·</span>
              <span className="text-text-faint">{timeAgo(item.lastSeenAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireCurrentUser } from "@/lib/session";
import { continentalRollup, branchProjects, branchActivePeople, branchProfitTotal, branchHealth, branchFocusNote } from "@/lib/analytics";
import { money } from "@/lib/format";
import SyncTicker from "@/components/SyncTicker";
import RevealGrid from "@/components/RevealGrid";
import HealthDot from "@/components/HealthDot";

export default async function OverviewPage() {
  await requireCurrentUser();
  const rollup = await continentalRollup();

  const branchCards = await Promise.all(
    rollup.branches.map(async (b) => {
      const [projs, activePeople, profit, healthInfo, focus] = await Promise.all([
        branchProjects(b.id),
        branchActivePeople(b.id),
        branchProfitTotal(b.id),
        branchHealth(b.id),
        branchFocusNote(b.id),
      ]);
      return { branch: b, projs, activePeople, profit, ...healthInfo, focus };
    })
  );

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-faint">Continental — command center</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Everything Continental runs, in one place.</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Pulled automatically from Vercel, GitHub, and Supabase wherever possible. Manual entries are labeled, never assumed.
        </p>
      </div>

      <SyncTicker />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total projects" value={rollup.totalProjects.toString()} />
        <StatTile label="Active people" value={rollup.totalActivePeople.toString()} />
        <StatTile label="Branch profit (PKR)" value={money(rollup.totalProfitPKR, "PKR")} muted="self-reported" />
        <StatTile label="Branch profit (USD)" value={money(rollup.totalProfitUSD, "USD")} muted="self-reported" />
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Branches</h2>
          <span className="text-xs text-text-faint">{rollup.branches.length} branches · list is open, not fixed</span>
        </div>

        <RevealGrid>
          {branchCards.map(({ branch: b, projs, activePeople, profit, health, reason, focus }) => {
            const liveCount = projs.filter((p) => p.status === "live").length;
            return (
              <Link
                key={b.id}
                href={`/branches/${b.id}`}
                className="group block rounded-xl border border-border bg-panel p-5 transition-colors hover:border-live/30 hover:bg-panel-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-semibold text-text">{b.name}</h3>
                    <p className="mt-1 text-xs text-text-muted">{b.focus}</p>
                  </div>
                  <HealthDot health={health} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border-soft pt-4 text-sm">
                  <div>
                    <div className="font-mono text-lg text-text">{projs.length}</div>
                    <div className="text-[11px] text-text-faint">projects ({liveCount} live)</div>
                  </div>
                  <div>
                    <div className="font-mono text-lg text-text">{activePeople.length}</div>
                    <div className="text-[11px] text-text-faint">active people</div>
                  </div>
                  <div>
                    <div className="font-mono text-lg text-text">{money(profit.total, profit.currency)}</div>
                    <div className="text-[11px] text-text-faint">self-reported profit</div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-text-faint">
                  <span className="text-text-muted">Health:</span> {reason}
                </p>

                {focus && (
                  <p className="mt-3 rounded-md border border-border-soft bg-panel-2/60 px-3 py-2 text-xs text-text-muted">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-signal">Next focus — </span>
                    {focus}
                  </p>
                )}
              </Link>
            );
          })}
        </RevealGrid>
      </div>
    </div>
  );
}

function StatTile({ label, value, muted }: { label: string; value: string; muted?: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel px-4 py-3">
      <div className="font-mono text-xl font-medium text-text">{value}</div>
      <div className="mt-0.5 text-[11px] text-text-faint">
        {label}
        {muted && <span className="ml-1 text-signal/80">· {muted}</span>}
      </div>
    </div>
  );
}

# Continental OS

An internal operations command center for Continental and its branches (Remake Labs,
KDH, and whatever gets added next). Built from the Continental OS Pre-Doc PRD.

This is a **working, runnable scaffold** — not a mockup. Every page is real, the RBAC
and LeadFlow-isolation logic actually executes, and the sync routes have a genuine
integration path documented in code. What it is *not*, yet, is connected to your real
Vercel/GitHub/Supabase/Gmail accounts — that requires your tokens, which obviously
couldn't be included here. See "Wiring up real automation" below.

## Stack

- **Next.js 16** (App Router, TypeScript) — chosen over plain HTML/CSS because the
  system needs real server-side API routes (sync jobs, RBAC-checked data access) and
  a component model that scales to four interlocking modules. A static site couldn't
  do the automation half of this PRD at all.
- **Tailwind CSS v4** for styling.
- **Framer Motion** for the motion system (page reveals, nav indicator, ticker, list transitions).
- **lucide-react** available for iconography if you extend the UI.

### On "uipro init --ai claude"

I didn't run this — it's not a recognized package/CLI in the public npm or Anthropic
ecosystem, so I couldn't verify what it does or use it safely. I used the standard,
verifiable path instead: `create-next-app` (TypeScript + Tailwind + App Router) plus
`npm i framer-motion`. If `uipro` refers to something specific you have installed
locally, tell me what it does and I can adapt the project to it.

## Design direction

Continental OS is framed as a mission-control console, not a SaaS dashboard: dark
canvas, a signature **live sync telemetry ticker** at the top of the Overview and
Registry pages (a scrolling readout of real automated sync events), status expressed
as colored data rather than icons, and Space Grotesk / Inter / JetBrains Mono for
display / body / data type respectively. The telemetry ticker is the one deliberately
bold element — it's there specifically to make the PRD's central thesis ("automation
carries the primary load, not manual entry") visible at a glance, every time you open
the app.

## Project structure

```
src/
  lib/
    types.ts          Shared domain model for all four modules
    store.ts           In-memory data layer + seed data (see note below)
    rbac.ts             Access-control logic, incl. LeadFlow isolation
    analytics.ts        Derived rollups for the Branch Dashboard (Module C)
    role-context.tsx    Demo role switcher (stand-in for real auth — see below)
    format.ts           Small display helpers
  components/           Shared UI: nav, tickers, badges, client-side tables
  app/
    page.tsx                     Continental overview (Module C)
    branches/[branchId]/         Branch detail drill-down
    projects/                    Project Registry (Module A)
    projects/[id]/               Project detail + sync history
    inbox/                       Unified Inbox (Module B)
    access/                      Access & Ownership Map (Module D)
    leadflow/                    LeadFlow — the isolation demo
    api/sync/{vercel,github,supabase}/route.ts   Sync jobs (manual + scheduled trigger)
    api/inbox/[id]/handle/route.ts               Mark-handled toggle
```

## How each PRD problem maps to what's actually built

| Problem | Where it lives | What's real today |
|---|---|---|
| Infrastructure/deployment amnesia (1, 6) | Module A — `/projects`, `/projects/[id]` | Full schema, drift detector, search/filter, sync history. Sync routes run in "simulated" mode until you add API tokens (see below). |
| No branch-level visibility (2) | Module C — `/`, `/branches/[id]` | Fully real — rollups are computed live from Module A + D data, never a duplicate stored count. |
| Manual-only reporting rejected (3) | Cross-cutting | Every automatable field has a sync path; only profit and focus notes are manual, and both are explicitly labeled `self-reported`. |
| No public identity yet (4) | Architecture note | Nothing here blocks a future public site — branches/projects are structured, typed data, not baked into page markup. |
| Inbox fragmentation (5) | Module B — `/inbox` | Full triage UI (mark handled, project inference) over seeded messages. Real Gmail polling needs OAuth wiring (see below). |
| No access map (7) | Module D — `/access` | Fully real — people, roles, grants, audit log, all cross-linked to Module A. |
| Ad hoc credential storage (8) | Module D | Deliberately *not* rebuilt — `vaultReference` fields store links into a real password manager (Bitwarden suggested; any is fine) rather than secrets. |

## The RBAC / LeadFlow rule — how it's actually enforced

`src/lib/rbac.ts` gates visibility by **data**, not by name-matching "LeadFlow":
`Department.isRestricted` is the flag, `AccessGrant` rows (with optional `expiresAt`)
are the only way past it for non-superadmins, and every grant is logged in
`auditLog`. Try it live: open `/leadflow`, then use the role switcher in the top-right
to swap between Sam/Co-founder (superadmin — always in), Ali (developer — holds a
temporary 5-day grant seeded in `store.ts`, so try it before/after editing
`expiresAt`), and Hina/Bilal (department members with standing access). The page
enforces this for real, in the render logic, not just visually.

**Important:** the role switcher is a demo convenience so you can explore every
permission path without standing up auth. Before this touches real company data,
swap `role-context.tsx`'s source for a real server-verified session (NextAuth, Clerk,
or similar) issuing a signed session that server components/API routes can trust.
Every RBAC function already takes plain `person`/`role` data as arguments — this is a
call-site change, not a rewrite of the permission logic.

## Data layer — the one deliberate deviation from "just wire it up"

The PRD's suggested solutions (Vercel/GitHub/Supabase Management API syncs, Gmail
polling or forwarding, Bitwarden linkage) are all still the right call and are
documented/stubbed exactly as specified. The one thing I changed: **Continental OS
needs its own database**, separate from any Supabase project it's *tracking* as data.
Right now that's an in-memory store (`store.ts`) so the whole thing runs with zero
setup — but it resets on every server restart. For real use, swap it for Postgres
(Prisma or Drizzle) or a dedicated Supabase project that is *not* one of the tracked
client projects. Every function in `store.ts` is written like a repository layer
specifically so this swap doesn't touch any page or component.

## Wiring up real automation

Each sync route works in two modes:

- **No token set** → runs in "simulated" mode: it touches existing sync timestamps so
  you can see what a completed sync looks like, and tells you it's not configured.
- **Token set** → makes a real API call and upserts into the registry.

Environment variables to set (e.g. in `.env.local`):

```
VERCEL_API_TOKEN=...
VERCEL_TEAM_ID=...          # optional
VERCEL_ACCOUNT_LABEL=...    # how this account should be labeled in the UI

GITHUB_TOKEN=...
GITHUB_ORG=...

SUPABASE_MANAGEMENT_TOKEN=...
```

For multiple accounts per platform (the PRD is explicit that this matters — account
sprawl is one of the root problems), extend each route to loop over a stored list of
`{ label, token }` pairs instead of a single env var, tagging each synced project with
its source account (the `SyncStamp.accountLabel` field already supports this).

Gmail is not wired in this scaffold (it needs a full OAuth consent flow, which can't
be done headlessly). `Module B`'s `InboxAccount.strategy` field already supports
either path from the PRD (`"polling"` via Gmail API, or `"forwarding"` to one primary
address) — polling is the better long-term choice since it needs no per-inbox setup,
but forwarding is faster to stand up if the ten accounts are add-hoc Gmail addresses
you can log into once.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use the role selector top-right to explore every
visibility path, including the LeadFlow restriction.

## What I'd do next if this kept going

- Real auth (NextAuth) replacing the demo role switcher.
- A real database behind `store.ts`.
- OAuth flows for Gmail + the ability to register multiple Vercel/GitHub/Supabase accounts through the UI itself instead of env vars.
- Scheduled sync triggers (Vercel Cron or a queue) calling the same API routes already built.
- Bitwarden's actual API/CLI for the vault linkage, if you want grant creation to also open a "create vault item" flow rather than just storing a reference.

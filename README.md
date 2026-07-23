# Continental OS

An internal operations command center for Continental and its branches (Remake Labs,
KDH, and whatever gets added next). Built from the Continental OS Pre-Doc PRD.

This is a **working, runnable application** with real persistence and real
authentication — not a mockup, and not a demo that resets when you restart it.

## What's here

| Feature | How it works |
|---|---|
| **Auth** | Auth.js (NextAuth v5) with Credentials provider, bcrypt password hashes, real signed JWT sessions. Every page calls `requireCurrentUser()` server-side. |
| **Persistence** | SQLite via Prisma (`prisma/schema.prisma`). Swap the datasource for Postgres in production. |
| **Project Registry (Module A)** | All projects across every branch. Synced from Vercel, GitHub, and Supabase — or entered manually. Drift detector flags projects untouched 60+ days. |
| **Unified Inbox (Module B)** | A triage layer over connected Gmail inboxes. Real per-inbox OAuth (`/api/gmail/connect` → Google consent → `/api/gmail/callback`) and polling (`/api/sync/gmail`) using `googleapis`. |
| **Branch Intelligence (Module C)** | Overview dashboard with per-branch health (on_track / stale / needs_attention), project counts, profit, focus notes, and LeadFlow embedding (KDH). |
| **Access & Ownership (Module D)** | In-app access grants with expiration, external account logins (Vercel/GitHub/Supabase/Google), and a full audit log (superadmin-only). |
| **Discover — AI-powered reconciliation** | One-click `/api/discover` fetches everything from Vercel + GitHub + Supabase in parallel, exact/fuzzy-matches cross-source duplicates, then passes the rest to **Groq** (`llama-3.3-70b-versatile`) for branch assignment + status/description enrichment. Results show as **reviewable decisions** — nothing touches the Project table until a human approves each suggestion via `/api/discover/apply`. See `AI_IMPLEMENTATION.md`. |
| **LeadFlow isolation** | Restricted department data is gated by DATA (`isRestricted` flag), not by name-based checks. Members of the restricted department see their own data by default; outsiders need an explicit, expiring `AccessGrant`. Every view (granted or denied) is logged to the audit log. |
| **Cron automation** | `/api/cron` (Vercel Cron, every 6h) fans out to all sync targets, protected by `CRON_SECRET`. On-demand triggers also work via the UI (superadmin session). |

## Stack

- **Next.js 16** (App Router, TypeScript, all pages are real server components hitting a real database)
- **Prisma + SQLite** for persistence (swap the datasource for Postgres in production — see below)
- **Auth.js (NextAuth v5)** for real, server-verified sessions
- **Tailwind CSS v4** for styling, **Framer Motion** for the motion system
- **googleapis** for real Gmail OAuth + polling
- **Groq API** (`llama-3.3-70b-versatile`) for AI-powered project reconciliation and branch/field suggestions — free tier, OpenAI-compatible endpoint. Falls back to deterministic fuzzy matching when unconfigured.

## Running it

```bash
npm install
cp .env.example .env
# then replace AUTH_SECRET in .env with the output of: openssl rand -base64 32
npx prisma generate
npx prisma migrate deploy      # applies the existing migration to a fresh dev.db
npx prisma db seed             # re-seed if you ever wipe the DB
npm run dev
```

The repo ships with a working `dev.db` already migrated and seeded, so
`npm install`, setting up `.env`, and `npm run dev` is enough to try it —
`prisma migrate deploy`/`db seed` are only needed if you delete `dev.db`.

Open http://localhost:3000 — you'll land on `/login`.

### Demo accounts (all share the password `continental-2026`)

| Email | Name | Role | What to try |
|---|---|---|---|
| `abdullaharifsalimee@gmail.com` | Abdullah Arif (Co-owner) | superadmin | Sees everything, including LeadFlow and the audit log |
| `furqanahmed1872@gmail.com` | Furqan Ahmed (Co-owner) | superadmin | Same as Abdullah |
| `drmuhammadarifsaleemi@gmail.com` | Arslan Ahmed (Developer) | developer | Sees KDH + Remakes Labs projects; attached to LeadFlow dept |
| `abdulrehmanch4230@gmail.com` | Sukhran (Leads) | department_member | LeadFlow staff — sees LeadFlow by default, nothing outside KDH |
| `jazilansari12@gmail.com` | Jazil Sardar (Leads) | department_member | Same as Sukhran |

**Rotate all of these before this touches real company data** — they're seeded with a shared, known password.

## Environment variables

Required (already set in the shipped `.env` for local dev):

```
DATABASE_URL="file:./dev.db"    # resolved relative to prisma/, so this is prisma/dev.db
AUTH_SECRET="<a real random secret — regenerate with `openssl rand -base64 32`>"
AUTH_TRUST_HOST=true   # required when self-hosting outside Vercel's own domain
```

Optional — each unlocks one piece of real automation. Without them, the relevant
sync route runs in "simulated" mode (documented in the route itself) so the UI
still demonstrates the full flow:

```
VERCEL_API_TOKEN=...
VERCEL_TEAM_ID=...
VERCEL_ACCOUNT_LABEL=...

GITHUB_TOKEN=...
GITHUB_ORG=...

SUPABASE_MANAGEMENT_TOKEN=...

GOOGLE_CLIENT_ID=...        # your own Google Cloud OAuth app
GOOGLE_CLIENT_SECRET=...

CRON_SECRET=...             # shared secret for /api/cron and scheduled sync

LEADFLOW_SUPABASE_URL=...   # external LeadFlow Supabase project (falls back to local cache)
LEADFLOW_SUPABASE_SERVICE_KEY=...

GROQ_API_KEY=...            # Groq for AI Discover (deterministic fuzzy-match fallback if absent)
GROQ_MODEL=...              # default: llama-3.3-70b-versatile
```

## Architecture

```
prisma/
  schema.prisma        Full data model — all 4 modules + auth + external accounts + AI
  seed.ts               Seeds real Continental team data, with real password hashes
src/
  lib/
    prisma.ts            Prisma client singleton
    store.ts              Repository layer — every function is a real DB query
    auth.ts                Auth.js config (Credentials provider, JWT sessions)
    session.ts             requireCurrentUser() (redirects) / getSessionUserOrNull() (for APIs)
    rbac.ts                 Access-control logic, incl. LeadFlow isolation
    analytics.ts             Async rollups for the Branch Dashboard (Module C)
    cron-auth.ts              Shared authorizer for sync routes (session OR CRON_SECRET)
    gmail.ts                   OAuth2 client factory for Gmail
    ai.ts                      Groq API client (chat/completions, JSON mode, 10s timeout)
    fuzzy-match.ts            Deterministic name similarity + clustering (Levenshtein-based)
    discover-types.ts          Types for Discover: DiscoveredItem, MatchSuggestion, etc.
    reconcile.ts               Orchestrator: exact match → fuzzy match → Groq (branch + field)
  app/
    actions.ts                    Server actions: loginAction, signOutAction, updateProjectBranchAction,
                                  addExternalAccountAction
    login/                        Real credentials login form
    page.tsx                       Continental overview / Branch Intelligence (Module C)
    branches/[branchId]/            Branch detail — stats, team, clients, projects, LeadFlow embed
    projects/                       Project Registry (Module A) — filter, search, drift detector
    projects/[id]/                  Project detail — all fields, owners, grants, sync history
    inbox/                          Unified Inbox (Module B) — Gmail connect + message triage
    access/                         Access & Ownership (Module D) — grants, external accounts, audit log
    api/
      auth/[...nextauth]/           Auth.js route handler
      cron/                         Scheduled fan-out to all sync targets (every 6h)
      discover/                     Unified Discover: fetches Vercel+GitHub+Supabase, reconciles,
                                    stores pending AIDecision rows (never auto-writes to Project)
      discover/apply/               Apply or reject pending decisions — ONLY way to touch Project table
      sync/{vercel,github,supabase,gmail}/  Per-source sync jobs (cron- or session-authorized)
      gmail/{connect,callback}/     Real per-inbox Gmail OAuth flow
      inbox/[id]/handle/            Toggle message handled status
scripts/
  wipe-synced-projects.ts   Wipe Project + SyncStamp rows for clean Discover testing
  wipe-ai-decisions.ts      Wipe AIDecision + DiscoverRun rows
vercel.json                Cron schedule (every 6h)
```

## Still not fully solved (being upfront about it)

- **Gmail polling needs your own Google Cloud OAuth app.** The code is real and
  tested for structure, but I obviously can't create Google Cloud credentials on
  your behalf. Once `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, the
  "connect" button on each inbox in `/inbox` starts a real consent flow.
- **SQLite is fine for one machine, not for a team.** Before more than one person
  needs write access concurrently, move `DATABASE_URL` to a real Postgres instance
  (swap the `provider` in `schema.prisma` and re-run `prisma migrate deploy`) —
  the repository layer in `store.ts` doesn't change.
- **Credential vault linkage is still references-only**, per the PRD's own
  instruction not to rebuild a password manager. `vaultReference` fields point at
  Bitwarden item IDs/URLs; nothing here stores or displays actual secrets.
- **The demo password is shared and known.** Fine for evaluating this build,
  not fine once it's holding real KDH/Remake Labs data — rotate immediately.
- **AI Discover uses Groq (free tier)** — no billing required to start, but rate
  limits apply. The system gracefully degrades to fuzzy-matching-only if Groq is
  unconfigured or returns errors. See `AI_IMPLEMENTATION.md` for known risks
  (false merges, latency, cost creep, data leakage).

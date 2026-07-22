# Continental OS

An internal operations command center for Continental and its branches (Remake Labs,
KDH, and whatever gets added next). Built from the Continental OS Pre-Doc PRD.

This is a **working, runnable application** with real persistence and real
authentication — not a mockup, and not a demo that resets when you restart it.

## What changed since the first pass

An earlier version of this shipped with an in-memory store and a client-side
role-switcher dropdown. Both were correctly flagged as gaps and have been replaced:

| Gap | Fixed by |
|---|---|
| In-memory data, resets on restart | **SQLite via Prisma** (`prisma/schema.prisma`). Persists across restarts. |
| Client-side role dropdown — anyone could "pick" superadmin | **Auth.js (NextAuth v5)** with a Credentials provider, bcrypt password hashes, real signed sessions. Every page calls `requireCurrentUser()` server-side. |
| LeadFlow visibility only logged on grant/revoke, not on view | LeadFlow page writes an audit row (`view_leadflow` or `denied_leadflow_attempt`) on **every load**, granted or denied. |
| Module D tracked in-app grants only, not real external logins | Added `ExternalAccount` + `ExternalAccountAccess` models — Module D now shows who owns and who shares each actual Vercel/GitHub/Supabase/Google login. |
| Sync routes were manual-trigger only | Added `/api/cron` + `vercel.json` cron schedule (every 6h), protected by `CRON_SECRET`. Manual trigger (superadmin session) still works from the UI. |
| Gmail was fully faked (static seed data, no wiring) | Real per-inbox OAuth flow (`/api/gmail/connect` → Google consent → `/api/gmail/callback`) and a real polling route (`/api/sync/gmail`) using `googleapis`. Needs your own Google Cloud OAuth app credentials to activate — see below. |

**One bug this round of testing caught and fixed:** the RBAC check for LeadFlow
originally only allowed superadmins or people holding an explicit `AccessGrant` —
it forgot that actual LeadFlow *staff* (people whose `departmentIds` includes the
department) should see their own department's data by default, per the PRD's own
"Department member — visibility limited to their own department's tools" rule.
Tested with four real logged-in sessions (superadmin, LeadFlow staff, a developer
with a temporary grant, and a true outsider with neither) before and after the fix
— see `src/lib/rbac.ts`.

## Stack

- **Next.js 16** (App Router, TypeScript, all pages are real server components hitting a real database)
- **Prisma + SQLite** for persistence (swap the datasource for Postgres in production — see below)
- **Auth.js (NextAuth v5)** for real, server-verified sessions
- **Tailwind CSS v4** for styling, **Framer Motion** for the motion system
- **googleapis** for real Gmail OAuth + polling

### On "uipro init --ai claude"

Still not a tool I could find or verify, so I used the standard, verifiable path:
`create-next-app` (TypeScript + Tailwind + App Router) plus `npm i framer-motion`.

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

### Demo accounts (all share the password `continental-demo`)

| Email | Role | What to try |
|---|---|---|
| `sam@continental.internal` | superadmin | Sees everything, including LeadFlow and the audit log |
| `cofounder@continental.internal` | superadmin | Same as Sam |
| `ali@continental.internal` | developer | Sees Remake Labs projects; has a **temporary 5-day grant** into LeadFlow — try it before/after that expires |
| `hina@kdh.internal` / `bilal@kdh.internal` | department_member | Actual LeadFlow staff — see LeadFlow by default, nothing else outside their branch |

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
```

## Architecture

```
prisma/
  schema.prisma        Full data model — all 4 modules + auth + external accounts
  seed.ts               Seeds the same demo company data, with real password hashes
src/
  lib/
    prisma.ts            Prisma client singleton
    store.ts              Repository layer — every function is a real DB query
    auth.ts                Auth.js config (Credentials provider, JWT sessions)
    session.ts             requireCurrentUser() (redirects) / getSessionUserOrNull() (for APIs)
    rbac.ts                 Access-control logic, incl. LeadFlow isolation (now fixed)
    analytics.ts             Async rollups for the Branch Dashboard (Module C)
    cron-auth.ts              Shared authorizer for sync routes (session OR CRON_SECRET)
    gmail.ts                   OAuth2 client factory for Gmail
  app/
    login/                       Real credentials login form
    actions.ts                    Server actions: loginAction, signOutAction
    page.tsx                       Continental overview (Module C)
    branches/[branchId]/            Branch detail
    projects/, projects/[id]/        Project Registry (Module A)
    inbox/                             Unified Inbox (Module B) + Gmail connect UI
    access/                             Access & Ownership Map (Module D) + external accounts
    leadflow/                            LeadFlow — real isolation + audit-on-view
    api/auth/[...nextauth]/               Auth.js route handler
    api/sync/{vercel,github,supabase,gmail}/  Sync jobs (session- or cron-authorized)
    api/cron/                              Scheduled fan-out (see vercel.json)
    api/gmail/{connect,callback}/           Real per-inbox Gmail OAuth flow
vercel.json                                Cron schedule (every 6h)
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

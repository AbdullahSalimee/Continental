# Continental OS — Full Project Review & AI Implementation Guide

> **Generated:** July 2026  
> **Purpose:** This document is designed so ANY AI agent can pick up this project and start working immediately. Each section tells the AI exactly what to do, which files to read/write, and what patterns to follow.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [AI Setup Instructions](#2-ai-setup-instructions)  
3. [File-by-File Reference](#3-file-by-file-reference)
4. [Complete Data Model](#4-complete-data-model)
5. [Coding Conventions & Patterns](#5-coding-conventions--patterns)
6. [Module A: Project Registry](#6-module-a-project-registry)
7. [Module B: Unified Inbox](#7-module-b-unified-inbox)
8. [Module C: Domain Intelligence](#8-module-c-domain-intelligence)
9. [Module D: Access & Ownership](#9-module-d-access--ownership)
10. [Discover / AI Reconciliation](#10-discover--ai-reconciliation)
11. [LeadFlow Integration](#11-leadflow-integration)
12. [New Features to Implement](#12-new-features-to-implement)
13. [Bugs & Issues to Fix](#13-bugs--issues-to-fix)
14. [Commercial Roadmap](#14-commercial-roadmap)
15. [Code Quality Notes](#15-code-quality-notes)

---

## 1. Project Overview

Continental OS is an **internal operations command center** for Continental — a small software agency with three domains:

| Domain | Focus | Notes |
|---|---|---|
| **KDH (Kasur Digital Hub)** | Digitizing local businesses in Kasur, Pakistan | Has departments: Project, LeadFlow (restricted) |
| **Remakes Labs** | Alternative versions of popular websites | `domainType: no_clients` — no client field |
| **Fiverr** | Freelance/service work | Not yet launched |

The app auto-syncs projects from Vercel, GitHub, and Supabase, uses AI (Groq) to cross-match duplicates, and provides a unified dashboard for domain health, inbox triage, access control, and audit logging.

### Quick Start for AI

```bash
# Run the project locally
npm install
npx prisma generate
npx prisma migrate deploy   # only if dev.db doesn't exist
npx prisma db seed          # demo data: 5 users, 4 domains
npm run dev                 # http://localhost:3000
```

**Demo login:** Any of the 5 seeded users, password `continental-2026`.

### Tech Stack (exact versions)

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.2.11 | App Router, React Server Components, API routes |
| React | 19.2.4 | UI framework |
| TypeScript | ^5 | Type safety (NOT strict mode currently) |
| Prisma | ^5.22.0 | ORM, schema-first, SQLite (swap to Postgres) |
| Auth.js (NextAuth) | ^5.0.0-beta.32 | Credentials provider, JWT sessions |
| Tailwind CSS | ^4 | Styling, dark theme |
| Framer Motion | ^12.42.2 | Animations |
| googleapis | ^173.0.0 | Gmail OAuth + polling |
| Groq API | llama-3.3-70b-versatile | AI Discover reconciliation (free tier) |
| bcryptjs | ^3.0.3 | Password hashing |
| lucide-react | ^1.25.0 | Icons |
| PostCSS | — | With @tailwindcss/postcss plugin |
| ESLint | ^9 | Linting (Next.js core-web-vitals + TS) |
| tsx | ^4.23.1 | Running TypeScript scripts |

---

## 2. AI Setup Instructions

### 2.1 Before Making ANY Code Changes

Read these files first to understand the codebase conventions:

```bash
# Must-read files in order:
src/lib/types.ts          # All domain types — understand the data shapes
prisma/schema.prisma      # Database schema — understand the models
src/lib/store.ts          # Repository layer — ALL database queries live here
src/lib/session.ts        # How authentication works
src/lib/rbac.ts           # Role-based access control rules
src/lib/analytics.ts      # Business logic (health, drift, rollups)
src/lib/reconcile.ts      # Discover pipeline orchestration
src/app/api/discover/route.ts        # Discover endpoint
src/app/api/discover/apply/route.ts  # Apply/reject decisions
```

### 2.2 Important Next.js 16 Warnings

This project uses **Next.js 16** which has breaking changes from earlier versions. Before writing any code, read:

```
node_modules/next/dist/docs/
```

Key differences:
- `params` in page/layout props is now a `Promise` — must be awaited
- React 19 RSC conventions apply
- Turbopack is the default bundler (no webpack config)

### 2.3 Pattern Files to Copy

When creating new components, pages, or API routes, copy from:

| New Item | Copy Pattern From |
|---|---|
| New server page | `src/app/projects/page.tsx` |
| New client component | `src/components/ProjectRegistryClient.tsx` |
| New API route | `src/app/api/sync/vercel/route.ts` |
| New server action | `src/app/actions.ts` |
| New Prisma model | Schema already has 13 models — see `prisma/schema.prisma` |
| New store function | `src/lib/store.ts` — all queries follow the same pattern |

---

## 3. File-by-File Reference

### 3.1 Source Files

| File | Purpose | What to Change |
|---|---|---|
| `src/app/layout.tsx` | Root layout: fonts, TopNav, max-width container | Rarely touched |
| `src/app/globals.css` | Dark theme CSS, Tailwind theme variables, animations | Add new theme tokens or animations here |
| `src/app/actions.ts` | Server actions: login, signOut, updateProjectDomain, addExternalAccount | Add new server actions here |
| `src/app/page.tsx` | Overview dashboard / Module C | Domain cards, stats grid |
| `src/app/login/page.tsx` | Login form | Styling changes only |
| `src/app/projects/page.tsx` | Project Registry page (Module A) | Server component wrapper |
| `src/app/projects/[id]/page.tsx` | Project detail page | All project fields, owners, grants, sync history |
| `src/app/domains/[domainId]/page.tsx` | Domain detail page | Stats, team, clients, departments, LeadFlow, projects |
| `src/app/inbox/page.tsx` | Unified Inbox page (Module B) | Server component wrapper |
| `src/app/access/page.tsx` | Access & Ownership page (Module D) | People, external accounts, grants, audit log |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js handler | Never touch |
| `src/app/api/cron/route.ts` | Cron dispatcher | Add new sync targets here |
| `src/app/api/discover/route.ts` | Discover endpoint | Fetch logic, enrichment, decision storage |
| `src/app/api/discover/apply/route.ts` | Apply/reject decisions | Project creation, domain assignment, status updates |
| `src/app/api/sync/vercel/route.ts` | Vercel sync | Add multi-account support |
| `src/app/api/sync/github/route.ts` | GitHub sync | Add multi-org support |
| `src/app/api/sync/supabase/route.ts` | Supabase sync | Rarely changed |
| `src/app/api/sync/gmail/route.ts` | Gmail polling | Token refresh, error handling |
| `src/app/api/gmail/connect/route.ts` | Gmail OAuth initiation | Rarely changed |
| `src/app/api/gmail/callback/route.ts` | Gmail OAuth callback | Token storage, encryption |
| `src/app/api/inbox/[id]/handle/route.ts` | Toggle message handled | Rarely changed |

### 3.2 Component Files

| File | Type | Purpose |
|---|---|---|
| `src/components/TopNav.tsx` | Client | Navigation with Framer Motion active indicator |
| `src/components/ProjectRegistryClient.tsx` | Client | Registry table, filters, Discover UI, decision review |
| `src/components/InboxClient.tsx` | Client | Inbox message list, Gmail sync, connect buttons |
| `src/components/SyncTicker.tsx` | Server | Horizontal scrolling sync telemetry |
| `src/components/StatusBadge.tsx` | Server | Color-coded status badges |
| `src/components/HealthDot.tsx` | Server | Domain health indicator |
| `src/components/DomainAssignSelect.tsx` | Client | Inline domain dropdown |
| `src/components/RevealGrid.tsx` | Client | Animated grid with staggered children |

### 3.3 Library Files

| File | Purpose | Key Exports |
|---|---|---|
| `src/lib/prisma.ts` | Prisma client singleton | `prisma` |
| `src/lib/store.ts` | ALL database queries (457 lines) | `getProjects()`, `getPeople()`, `upsertProjectFromSync()`, etc. |
| `src/lib/auth.ts` | Auth.js config | `handlers`, `auth`, `signIn`, `signOut` |
| `src/lib/session.ts` | Session helpers | `requireCurrentUser()`, `getSessionUserOrNull()` |
| `src/lib/rbac.ts` | Role-based access control | `isSuperadmin()`, `canSeeDepartment()`, `canSeeProject()` |
| `src/lib/analytics.ts` | Business logic | `continentalRollup()`, `domainHealth()`, `projectDrift()` |
| `src/lib/types.ts` | Domain types (207 lines) | `Project`, `Domain`, `Person`, `Role`, etc. |
| `src/lib/format.ts` | Utilities | `timeAgo()`, `money()`, `sourceLabel()` |
| `src/lib/ai.ts` | Groq API client | `callGroqJSON()`, `isAIConfigured()`, `extractJSON()` |
| `src/lib/fuzzy-match.ts` | Deterministic name matching | `nameSimilarity()`, `fuzzyGroup()`, `guessDomainByKeywords()` |
| `src/lib/reconcile.ts` | Discover orchestrator | `reconcile()` — exact → fuzzy → AI pipeline |
| `src/lib/discover-types.ts` | Discover types | `DiscoveredItem`, `MatchSuggestion`, `hashItems()` |
| `src/lib/cron-auth.ts` | Sync authorization | `authorizeSyncRequest()` |
| `src/lib/gmail.ts` | Google OAuth factory | `createOAuthClient()`, `GMAIL_SCOPE` |

### 3.4 Config & Script Files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | 13 models: Role, Person, Domain, Department, Client, ExternalAccount, ExternalAccountAccess, Project, SyncStamp, InboxAccount, InboxMessage, ProfitEntry, DomainFocusNote, AccessGrant, AuditLogEntry, DiscoverRun, AIDecision, LeadFlowLead |
| `prisma/seed.ts` | Seeds 3 roles, 4 domains, 2 departments, 5 people, 2 clients, 2 focus notes |
| `prisma/dev.db` | Pre-seeded SQLite database (works out of the box) |
| `.env.example` | Template showing all env vars |
| `vercel.json` | Cron schedule: every 6h |
| `next.config.ts` | Minimal config (empty) |
| `eslint.config.mjs` | ESLint config |
| `scripts/wipe-projects.ts` | Clear Project + SyncStamp rows |
| `scripts/wipe-ai-decisions.ts` | Clear DiscoverRun + AIDecision rows |

---

## 4. Complete Data Model

```prisma
// Auth
model Role              { id, name (unique), description, people[] }
model Person            { id, name, email (unique), passwordHash, roleId, role, active, createdAt,
                         domains[], departments[], ownedProjects[], grantsReceived[], grantsIssued[],
                         auditActions[], profitEntries[], focusNotes[], leadFlowLeads[],
                         ownedExternalAccts[], externalAccountAccess[] }

// Reference
model Domain            { id, name, focus, notes?, domainType (standard|no_clients), createdAt,
                         departments[], projects[], clients[], profitEntries[], focusNote?, people[] }
model Department        { id, domainId, domain, name, isRestricted, restrictedReason?,
                         successMetric?, people[], projects[] }
model Client            { id, name, domainId, domain, isOutOfDomain, notes?, projects[] }

// Module A: Project Registry
model ExternalAccount   { id, platform (vercel|github|supabase|google|other), label,
                         vaultReference?, ownerPersonId?, owner?, createdAt,
                         projects[], accessList[], inboxAccounts[] }
model ExternalAccountAccess { id, externalAccountId, externalAccount, personId, person,
                              grantedAt, @@unique([externalAccountId, personId]) }
model Project           { id, name, domainId, domain, departmentId?, department?,
                         liveUrl?, previewUrls? (JSON string[]), hostingPlatform?,
                         externalAccountId?, externalAccount?, repoUrl?, databaseRef?,
                         status, clientId?, client?, deliveryModel?, createdAt, lastKnownUpdateAt,
                         notes?, source (auto|manual|auto+manual),
                         owners[], syncStamps[], inboxAccounts[], inboxMessages[] }
model SyncStamp         { id, projectId, project, source (vercel_api|github_api|supabase_api|manual),
                         accountLabel, lastSeenAt, reachable?, assignedDomainId? }

// Module B: Unified Inbox
model InboxAccount      { id, label, strategy (polling|forwarding), linkedProjectId?, linkedProject?,
                         externalAccountId?, externalAccount?, googleRefreshToken? (encrypt in prod),
                         lastPolledAt?, messages[] }
model InboxMessage      { id, accountId, account, from, subject, snippet, receivedAt,
                         handled (default false), inferredProjectId?, inferredProject?,
                         gmailMessageId? (unique) }

// Module C: Domain Intelligence
model ProfitEntry       { id, domainId, domain, amount, currency, note, recordedAt,
                         recordedByPersonId, recordedBy, verified (default "self_reported") }
model DomainFocusNote   { id, domainId (unique), domain, note, updatedAt, updatedByPersonId, updatedBy }

// Module D: Access & Ownership
model AccessGrant       { id, personId, person, targetType (project|domain|department),
                         targetId, level (owner|editor|viewer), vaultReference?,
                         grantedAt, grantedByPersonId, grantedBy, expiresAt? }
model AuditLogEntry     { id, at, actorPersonId, actor, action, targetDescription, sensitive }

// Discover / AI
model DiscoverRun       { id, inputHash, createdAt, triggeredBy, aiUsed, raw (JSON string), decisions[] }
model AIDecision        { id, runId, run, action (match|assign_branch|suggest_status|suggest_description),
                         sourceItemIds (JSON string[]), suggestion (JSON string), reasoning?,
                         confidence, method (exact|fuzzy|ai|standalone), status (pending|accepted|rejected),
                         targetProjectId?, createdAt }

// LeadFlow
model LeadFlowLead      { id, clientName, city, status, ownerPersonId, owner, createdAt }
```

---

## 5. Coding Conventions & Patterns

### 5.1 Adding a New Server Page

```tsx
// File: src/app/example/page.tsx
import { requireCurrentUser } from "@/lib/session";
import { getSomething } from "@/lib/store";

export default async function ExamplePage() {
  const { person, role } = await requireCurrentUser();
  const data = await getSomething();
  return <div>{/* render */}</div>;
}
```

### 5.2 Adding a New Client Component

```tsx
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
// Remember: "use client" at the top for interactivity
```

### 5.3 Adding a New API Route

```tsx
// File: src/app/api/example/route.ts
import { NextResponse } from "next/server";
import { getSessionUserOrNull } from "@/lib/session";
import { isSuperadmin } from "@/lib/rbac";

export async function POST(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isSuperadmin(user.role)) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await req.json();
  // ... logic

  return NextResponse.json({ ok: true });
}
```

### 5.4 Adding a New Server Action

```tsx
// File: src/app/actions.ts
"use server";
import { requireCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function myNewAction(formData: FormData) {
  const { role } = await requireCurrentUser();
  // ... logic
  revalidatePath("/some-path");
}
```

### 5.5 Adding a New Store Function

```tsx
// File: src/lib/store.ts
export async function getSomething(): Promise<Something[]> {
  const rows = await prisma.someModel.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    // Map Prisma types to domain types (dates → ISO strings)
  }));
}
```

### 5.6 Adding a New Prisma Model

```prisma
// File: prisma/schema.prisma
model NewModel {
  id        String   @id @default(cuid())
  // Add fields here
  createdAt DateTime @default(now())
}
```

Then run:
```bash
npx prisma migrate dev --name add_new_model
npx prisma generate
```

### 5.7 UI Conventions

- **Colors:** Use Tailwind theme tokens: `bg-bg`, `bg-panel`, `bg-panel-2`, `border-border`, `text-text`, `text-text-muted`, `text-text-faint`, `text-live`, `text-danger`, `text-signal`, `text-info`, `text-restricted`
- **Buttons:** `rounded-md border border-<color>/30 bg-<color>/10 px-3 py-1.5 text-xs font-mono text-<color> hover:bg-<color>/20`
- **Tables:** `overflow-hidden rounded-lg border border-border` wrapper, `w-full text-sm` table
- **Links:** `className="text-text hover:text-live"` for project names
- **Badges:** `rounded-full border px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide`

### 5.8 Critical Rules

1. **ALWAYS authorize** — Every API route checks `getSessionUserOrNull()` or `authorizeSyncRequest()`
2. **ALWAYS revalidate** — After mutations, call `revalidatePath()` so server components refresh
3. **NEVER hardcode domain names** — Domains are data-driven (stored in DB), use `findDomain()` or `getDomains()`
4. **NEVER use `any`** — Add proper types. Especially in `mapProject()` in `store.ts`
5. **NEVER store raw secrets** — Use `vaultReference` fields pointing to Bitwarden
6. **AI is never trusted** — AI write to AIDecision table, NOT Project table. Human must approve.
7. **Dates as ISO strings** — All store functions convert `Date` → `toISOString()` so they can pass from server to client

---

## 6. Module A: Project Registry

### Pages
- `src/app/projects/page.tsx` — Server component, fetches data, renders ProjectRegistryClient
- `src/app/projects/[id]/page.tsx` — Server component, shows all project fields

### API Routes
- `POST /api/sync/vercel` — Fetch all Vercel projects, upsert into Project table
- `POST /api/sync/github` — Fetch all GitHub repos, upsert into Project table
- `POST /api/sync/supabase` — Fetch all Supabase projects, upsert into Project table

### Key Component
- `src/components/ProjectRegistryClient.tsx` — "use client" component with:
  - Search input
  - Domain/status/drift filters
  - Discover button → `POST /api/discover`
  - Pending decisions review table (approve/reject per-item or bulk)
  - Project registry table with inline domain assignment

### Sync Logic (store.ts:363)
```
upsertProjectFromSync(input):
1. Check domain name convention matching (KDH, Remake, Fiverr in name)
2. Find existing project by exact name
3. If exists → update fields, NEVER override human domain assignment
4. If new → create Project + SyncStamp
```

### Drift Detection (analytics.ts:70)
```
projectDrift(project):
  - If status is archived/decommissioned/demo_only → not drifted
  - If last sync stamp is unreachable → drifted
  - If no update in 60+ days → drifted
  - Otherwise → not drifted
```

### To-Do for AI
- [ ] Add manual project creation UI (server action + form)
- [ ] Add project editing UI
- [ ] Add project deletion (with cascade confirmation)
- [ ] Add pagination to `getProjects()`
- [ ] Add export to CSV/JSON button

---

## 7. Module B: Unified Inbox

### Pages
- `src/app/inbox/page.tsx` — Server component, fetches messages/accounts/projects

### API Routes
- `POST /api/sync/gmail` — Poll all connected Gmail inboxes
- `GET /api/gmail/connect?inboxAccountId=xxx` — Initiate Google OAuth
- `GET /api/gmail/callback` — OAuth callback, store refresh token
- `POST /api/inbox/[id]/handle` — Toggle message handled status

### Key Component
- `src/components/InboxClient.tsx` — "use client" component with:
  - Inbox list (connection status, connect button)
  - Gmail sync button
  - Message list with mark handled / reopen

### Gmail OAuth Flow
```
User clicks "connect" → /api/gmail/connect → Google consent screen
→ User grants Gmail.readonly → /api/gmail/callback → store refresh token
→ Sync: /api/sync/gmail → fetch messages, create InboxMessage rows
```

### To-Do for AI
- [ ] Encrypt googleRefreshToken before storage (AES-256-GCM)
- [ ] Implement token auto-refresh for expired tokens
- [ ] Add AI-powered message → project inference
- [ ] Add manual message → project linking
- [ ] Add search/filter for inbox messages
- [ ] Add pagination for large inboxes

---

## 8. Module C: Domain Intelligence

### Pages
- `src/app/page.tsx` — Overview dashboard with domain cards
- `src/app/domains/[domainId]/page.tsx` — Domain detail page

### Key Library
- `src/lib/analytics.ts` — All rollup functions

### Overview Dashboard (page.tsx)
```
continentalRollup() → { totalProjects, totalActivePeople, totalProfitPKR, totalProfitUSD, domains }

For each domain:
  domainProjects(id) → Project[]
  domainActivePeople(id) → Person[]
  domainProfitTotal(id) → { total, currency, entries[] }
  domainHealth(id) → { health: "on_track"|"needs_attention"|"stale", reason }
  domainFocusNote(id) → string | null
```

### Domain Detail (domains/[domainId]/page.tsx)
Three views:
1. **Unassigned** — Assignment-focused: table of unassigned projects with domain dropdown
2. **Fiverr (no data)** — Placeholder: "Coming soon" message
3. **Normal** — Stats grid + team + clients + departments + LeadFlow + projects

### To-Do for AI
- [ ] Add domain management UI (create/edit/delete)
- [ ] Add department management UI
- [ ] Add profit entry management UI
- [ ] Add focus note editing UI
- [ ] Add client management UI
- [ ] Add chart/visualization for profit over time
- [ ] Add trend indicators (profit up/down, project velocity)

---

## 9. Module D: Access & Ownership

### Pages
- `src/app/access/page.tsx` — Server component with 4 sections

### Key Library
- `src/lib/rbac.ts` — Access control rules

### Sections
1. **People & roles** — Table with name, role, domains, grant count
2. **External account logins** — Which Vercel/GitHub/Supabase/Google accounts exist
3. **In-app access grants** — Explicit grants with expiration
4. **Audit log** — Superadmin-only, chronological event log

### RBAC Rules (rbac.ts)
```
isSuperadmin(role)       → role.name === "superadmin"
canSeeDepartment(person, role, department, grants):
  - If NOT restricted → anyone can see
  - If restricted → superadmin OR department member OR explicit grant
canSeeProject(person, role, projectDomainId, grants):
  - If superadmin → yes
  - If developer on same domain → yes
  - If explicit project grant → yes
```

### To-Do for AI
- [ ] Add access grant creation UI (target type, level, expiration)
- [ ] Add access grant revocation UI
- [ ] Add user creation/editing/deactivation UI
- [ ] Add password reset/rotation flow
- [ ] Add invite-link user onboarding

---

## 10. Discover / AI Reconciliation

### API Routes
- `POST /api/discover` — The single "Discover" button. Fetches everything, reconciles, stores decisions.
- `POST /api/discover/apply` — Accept specific decisions by ID → creates/updates projects
- `DELETE /api/discover/apply` — Reject specific decisions by ID

### Pipeline (reconcile.ts)
```
reconcile(items: DiscoveredItem[]):
  Step 1:   Exact name match (Map<string, DiscoveredItem[]>)
  Step 1.5: Absorb near-matches into exact groups
  Step 2:   Fuzzy Levenshtein clustering (threshold 0.82)
  Step 3:   Batched Groq call (if configured) for match + domain + field
  Returns:  { matches[], standalone[], domainSuggestions[], fieldSuggestions[], aiUsed }
```

### AI Client (ai.ts)
```
callGroqJSON(systemPrompt, userPrompt):
  - POST to https://api.groq.com/openai/v1/chat/completions
  - Model: GROQ_MODEL (default: llama-3.3-70b-versatile)
  - temperature: 0 (deterministic)
  - timeout: 10s (AbortController)
  - response_format: { type: "json_object" }
  - Returns: { ok, text } or { ok: false, error }
```

### AI Prompt (reconcile.ts:192-207)
```
System prompt tells Groq:
- Available domains (from DB)
- Which items are already matched by deterministic methods
- Response must be JSON: { matches[], domainSuggestions[], fieldSuggestions[] }
- Confidence should reflect actual certainty (0.2 = weak guess, 0.8+ = strong)

User prompt: serialized items with { id, source, name, description, language, databaseRef, status, alreadyMatched }
```

### Key Design Decisions
1. AI output is NEVER trusted — stored as pending AIDecision rows
2. Standalone items get a "match" decision so they become projects
3. Domain/field suggestions require the project to already exist
4. Input hash (SHA-256) caches runs — identical data doesn't re-call AI
5. Already-matched items are NEVER re-litigated by AI

### To-Do for AI
- [ ] Add AI provider abstraction (OpenAI, Anthropic, Gemini)
- [ ] Add AI confidence tracking (compare suggestions vs human decisions)
- [ ] Add rollback for applied decisions
- [ ] Add scheduled Discover (cron)
- [ ] Add Discover results history page
- [ ] Add user feedback loop on AI suggestions

---

## 11. LeadFlow Integration

LeadFlow is a restricted CRM department within KDH. Data comes from either:
1. **External Supabase project** — When `LEADFLOW_SUPABASE_URL` + `LEADFLOW_SUPABASE_SERVICE_KEY` are set
2. **Local cache** — Falls back to `LeadFlowLead` table in SQLite

### Access Control
- Department is marked `isRestricted: true`
- Only superadmins and explicit AccessGrant holders can see LeadFlow data
- Every view attempt (granted or denied) is logged to audit log

### Code Location
- `src/lib/store.ts:277-319` — `getLeadFlowLeads()` function
- `src/app/domains/[domainId]/page.tsx:167-187` — LeadFlow embed in KDH domain page
- `src/lib/rbac.ts:23-55` — `canSeeDepartment()` check

---

## 12. New Features to Implement

Each feature below includes the exact files to create/modify.

### P0 — Core CRUD Operations

#### Domain CRUD
```
Files to create:
  - src/app/api/domains/route.ts          (POST: create domain)
  - src/app/api/domains/[id]/route.ts      (PUT/DELETE: update/delete)
  - src/components/DomainForm.tsx           (create/edit form, "use client")
  - src/app/domains/page.tsx               (domain management page)

Files to modify:
  - src/app/actions.ts                      (add server actions if needed)
  - src/lib/store.ts                        (add createDomain, updateDomain, deleteDomain)

Prisma: Already has Domain model — no schema change needed
```

#### Department CRUD
```
Files to create:
  - src/app/api/departments/route.ts
  - src/app/api/departments/[id]/route.ts
  - src/components/DepartmentForm.tsx
  - src/app/departments/page.tsx

Files to modify:
  - src/lib/store.ts                        (add department CRUD functions)

Prisma: Already has Department model
```

#### User Management
```
Files to create:
  - src/app/users/page.tsx                  (user list + management UI)
  - src/app/users/add/page.tsx              (invite/create user form)
  - src/app/users/[id]/edit/page.tsx        (edit user form)
  - src/components/UserForm.tsx             (reusable user form)
  - src/app/api/users/route.ts              (CRUD API)
  - src/app/api/users/invite/route.ts       (send invite email)

Files to modify:
  - src/lib/store.ts                        (add createPerson, updatePerson, deactivatePerson)
  - src/app/access/page.tsx                 (link to user management)

Prisma: Already has Person model
```

#### Project CRUD (Manual)
```
Files to create:
  - src/app/api/projects/route.ts           (POST: create, GET with pagination)
  - src/app/api/projects/[id]/route.ts      (PUT/DELETE: update/delete)
  - src/components/ProjectForm.tsx          (create/edit form)

Files to modify:
  - src/lib/store.ts                        (add createProject, updateProject, deleteProject)
  - src/components/ProjectRegistryClient.tsx (add "Add project" button)

Prisma: Already has Project model
```

#### Access Grant Management
```
Files to create:
  - src/components/GrantForm.tsx            (create grant UI)
  - src/app/api/grants/route.ts             (POST: create grant)
  - src/app/api/grants/[id]/route.ts        (DELETE: revoke grant)

Files to modify:
  - src/lib/store.ts                        (add createAccessGrant, revokeAccessGrant)
  - src/app/access/page.tsx                 (add inline grant management UI)

Prisma: Already has AccessGrant model
```

#### Client Management
```
Files to create:
  - src/app/api/clients/route.ts
  - src/app/api/clients/[id]/route.ts
  - src/components/ClientForm.tsx

Files to modify:
  - src/lib/store.ts                        (add client CRUD functions)

Prisma: Already has Client model
```

#### Focus Note Editing
```
File to create:
  - src/app/api/focus-notes/[domainId]/route.ts (PUT: update focus note)

File to modify:
  - src/app/domains/[domainId]/page.tsx   (add edit button on focus note)

Prisma: Already has DomainFocusNote model
```

#### Profit Entry Management
```
Files to create:
  - src/app/api/profit-entries/route.ts     (POST: create)
  - src/app/api/profit-entries/[id]/route.ts (PUT/DELETE)
  - src/components/ProfitEntryForm.tsx

Files to modify:
  - src/lib/store.ts                        (add profit entry CRUD)

Prisma: Already has ProfitEntry model
```

### P0 — Infrastructure & Quality

#### Postgres Migration
```
Files to modify:
  - prisma/schema.prisma                    (change provider from "sqlite" to "postgresql")
  - .env                                    (change DATABASE_URL to Postgres connection string)

Commands to run:
  - npx prisma migrate dev --name init_postgres
  - npx prisma db seed

Prisma: change line 6: provider = "postgresql"
```

#### Test Suite Setup
```
Files to create:
  - jest.config.ts
  - src/lib/__tests__/fuzzy-match.test.ts   (unit test for name matching)
  - src/lib/__tests__/analytics.test.ts     (unit test for health/drift)
  - src/lib/__tests__/rbac.test.ts          (unit test for access control)
  - src/lib/__tests__/reconcile.test.ts     (unit test for Discover pipeline)
  - src/__tests__/setup.ts                 (test DB setup)

Files to modify:
  - package.json                            (add jest, @testing-library/react, etc.)
  - prisma/schema.prisma                    (add test database config if needed)

Commands:
  - npm install -D jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom
```

#### Loading & Error UI
```
Files to create:
  - src/app/loading.tsx                     (global loading state)
  - src/app/error.tsx                       (global error boundary)
  - src/app/not-found.tsx                   (global 404)
  - src/app/projects/loading.tsx
  - src/app/projects/error.tsx
  - src/app/inbox/loading.tsx
  - src/app/inbox/error.tsx
  - src/app/access/loading.tsx
  - src/app/access/error.tsx
  - src/app/domains/loading.tsx
  - src/app/domains/error.tsx

Next.js convention: files named exactly loading.tsx, error.tsx, not-found.tsx
```

#### Input Validation
```
Files to create:
  - src/lib/validations.ts                  (Zod schemas for all API routes)

Files to modify:
  - src/app/api/discover/apply/route.ts     (add Zod validation for body)
  - src/app/api/sync/vercel/route.ts        (add if accepting body params)
  - src/app/actions.ts                      (add Zod validation to server actions)

Pattern:
  import { z } from "zod";
  const applySchema = z.object({
    decisionIds: z.array(z.string()).min(1)
  });
```

### P1 — Enhanced Features

#### Notifications System
```
Files to create:
  - src/lib/notifications.ts                (notification logic + email sending)
  - src/app/api/notifications/route.ts      (mark as read, list)
  - src/components/NotificationBell.tsx     (UI component in header)
  - prisma/migrations/                      (add Notification model)

Files to modify:
  - src/lib/store.ts                        (add notification queries)
  - src/app/layout.tsx                      (add notification bell to TopNav area)
  - src/app/cron/route.ts                   (add notification dispatch to cron)

Prisma: Add Notification model:
  model Notification {
    id        String   @id @default(cuid())
    personId  String
    title     String
    body      String
    read      Boolean  @default(false)
    link      String?  (e.g. "/projects/abc")
    createdAt DateTime @default(now())
  }
```

#### Data Export
```
Files to create:
  - src/app/api/export/projects/route.ts    (GET → CSV/JSON)
  - src/app/api/export/inbox/route.ts
  - src/app/api/export/audit/route.ts

Files to modify:
  - src/components/ProjectRegistryClient.tsx (add export button)
  - src/app/access/page.tsx                  (add export button for audit log)
```

#### Activity Feed
```
Files to create:
  - src/components/ActivityFeed.tsx         (chronological event list)

Files to modify:
  - src/app/page.tsx                        (add activity feed section)
  - src/lib/store.ts                        (add getRecentActivity query combining audit + sync + projects)
```

#### Multi-GitHub-Org Sync
```
Files to modify:
  - src/app/api/sync/github/route.ts        (loop over ExternalAccount records for platform="github")
  - src/app/api/discover/route.ts           (update fetchGitHub to handle multiple accounts)

Pattern: Read from ExternalAccount table instead of single GITHUB_TOKEN env var
```

#### Multi-Vercel-Account Sync
```
Files to modify:
  - src/app/api/sync/vercel/route.ts        (loop over ExternalAccount records for platform="vercel")
  - src/app/api/discover/route.ts           (update fetchVercel to handle multiple accounts)

Pattern: Read from ExternalAccount table + store tokens in vault (never in env vars)
```

### P2 — Polish & Extras

#### Keyboard Shortcuts
```
Files to create:
  - src/lib/keyboard.ts                     (shortcut definitions)
  - src/components/KeyboardHelp.tsx         ("?" key → show shortcut reference)

Files to modify:
  - src/app/layout.tsx                      (register global keyboard handler)

Shortcuts:
  g o → / (Overview), g p → /projects, g i → /inbox, g a → /access
  ? → show help modal
```

#### Bulk Operations (Project Registry)
```
Files to modify:
  - src/components/ProjectRegistryClient.tsx (add checkbox column, bulk action bar)
  - src/app/actions.ts                      (add bulkUpdateProjectStatus, bulkAssignDomain)
```

#### Tags/Labels on Projects
```
Prisma: Add model:
  model Tag {
    id        String   @id @default(cuid())
    name      String   @unique
    color     String?
    projects  ProjectTag[]
  }
  model ProjectTag {
    projectId String
    project   Project   @relation(fields: [projectId], references: [id])
    tagId     String
    tag       Tag       @relation(fields: [tagId], references: [id])
    @@unique([projectId, tagId])
  }

Files to create:
  - src/components/TagInput.tsx
  - src/app/api/tags/route.ts
  - src/app/api/projects/[id]/tags/route.ts
```

#### LeadFlow Kanban Board
```
Files to create:
  - src/components/LeadFlowKanban.tsx       (drag-and-drop lead board)

Files to modify:
  - src/app/domains/[domainId]/page.tsx    (replace table with Kanban option)

Depends on: framer-motion already included for drag-and-drop
```

---

## 13. Bugs & Issues to Fix

Each issue includes exact file path + line number + fix instructions.

### Security (Critical)

#### Issue 1: Gmail refresh tokens stored in plaintext
- **File:** `src/app/api/gmail/callback/route.ts:23`
- **Fix:** Encrypt `googleRefreshToken` before storing
```ts
// In src/lib/crypto.ts (new file)
import crypto from "crypto";
const ALGORITHM = "aes-256-gcm";
const KEY = process.env.ENCRYPTION_KEY; // 32 bytes, hex-encoded

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY!, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(encoded: string): string {
  const [ivHex, authTagHex, encryptedHex] = encoded.split(":");
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(KEY!, "hex"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(encryptedHex, "hex", "utf8") + decipher.final("utf8");
}
```

#### Issue 2: Shared demo password
- **File:** `prisma/seed.ts:5`
- **Fix:** After production deployment, run a script to force password reset:
```ts
// scripts/force-password-reset.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
// Set a flag on each person that requires password change on next login
// Or simply re-seed with unique random passwords
```

#### Issue 3: Timing-attackable CRON_SECRET comparison
- **File:** `src/lib/cron-auth.ts:12`
- **Fix:** Use `crypto.timingSafeEqual()`
```ts
import crypto from "crypto";

// Replace: if (cronSecret && authHeader === `Bearer ${cronSecret}`)
// With:
if (cronSecret && authHeader) {
  const expected = `Bearer ${cronSecret}`;
  const actual = authHeader;
  if (expected.length === actual.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    return { ok: true, actor: "scheduled-cron" };
  }
}
```

### Code Quality (Medium)

#### Issue 9: Generic `any` type in mapProject
- **File:** `src/lib/store.ts:125`
- **Fix:** Define a proper type:
```ts
interface ProjectPrismaRow {
  id: string;
  name: string;
  domainId: string;
  // ... all fields from Prisma Project model
  owners: { id: string }[];
  syncStamps: { source: string; accountLabel: string; lastSeenAt: Date; reachable: boolean | null }[];
  externalAccount: { label: string } | null;
}

function mapProject(p: ProjectPrismaRow): Project { ... }
```

#### Issue 10: No TypeScript strict mode
- **File:** `tsconfig.json`
- **Fix:** Add `"strict": true` to compilerOptions and fix all resulting errors

#### Issue 14: Hardcoded domain name matching
- **File:** `src/lib/store.ts:348-352`
- **Fix:** Move domain-matching rules to a database table:
```prisma
model DomainNameRule {
  id        String @id @default(cuid())
  pattern   String // regex pattern
  domainId  String
  domain    Domain @relation(fields: [domainId], references: [id])
  priority  Int    @default(0) // higher = checked first
}
```

#### Issue 15: No pagination
- **File:** `src/lib/store.ts` (getProjects, getPeople, getInboxMessages)
- **Fix:** Add skip/take parameters:
```ts
export async function getProjects(skip = 0, take = 50): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    skip,
    take,
    include: projectInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapProject);
}
```

#### Issue 17: Duplicate wipe scripts
- **Files:** `scripts/wipe-projects.ts` and `scripts/wipe-synced-projects.ts`
- **Fix:** Delete `wipe-synced-projects.ts` — it's identical to `wipe-projects.ts`

### Testing & Reliability (Critical)

#### Issues 18-20: No tests at all
- **Setup commands:**
```bash
npm install -D jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom supertest @types/supertest
```
- **Test locations:**
  - `src/lib/__tests__/` — Unit tests for utility functions
  - `src/__tests__/` — Integration tests for API routes
  - `src/components/__tests__/` — Component tests

#### Issue 22: No monitoring
- **Setup:** `npm install @sentry/nextjs`
- **Config:** Follow Sentry Next.js 16 setup guide

#### Issue 24: API fetch failures silently return empty
- **File:** `src/app/api/discover/route.ts:233`
- **Fix:** Return error message to frontend instead of just logging:
```ts
// Don't just return []
// Return: { error: "Vercel API responded 429" }
// And show it in the Discover message banner
```

### UX (Medium)

#### Issue 29: No mobile-responsive layout
- **Fix:** Audit all page layouts and add responsive Tailwind classes:
  - `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` for grids
  - `overflow-x-auto` for tables
  - `flex-wrap` for button groups
  - Adjust padding/margins at `sm:` breakpoint

---

## 14. Commercial Roadmap

### Phase 1: Production Hardening (1-2 months)

| Priority | Task | Key Files |
|---|---|---|
| P0 | Postgres migration | `prisma/schema.prisma:6` (change provider), `.env` (update DATABASE_URL) |
| P0 | Encrypt Gmail tokens | Create `src/lib/crypto.ts`, modify `src/app/api/gmail/callback/route.ts` |
| P0 | Multi-tenant isolation | Add `organizationId` to all models in `prisma/schema.prisma` + scope all `store.ts` queries |
| P0 | Auth upgrade (SSO) | Add Google/GitHub providers to `src/lib/auth.ts` |
| P0 | Test suite | Create `jest.config.ts`, `src/lib/__tests__/` |
| P0 | CI/CD | Create `.github/workflows/ci.yml` |
| P0 | Monitoring (Sentry) | `npm install @sentry/nextjs`, follow setup guide |
| P1 | Input validation | Create `src/lib/validations.ts`, add Zod to all API routes |
| P1 | Error boundaries | Create `src/app/error.tsx`, `src/app/not-found.tsx` |
| P1 | Loading states | Create `src/app/loading.tsx` + per-route loading.tsx files |

### Phase 2: Feature Completion (2-3 months)

| Priority | Task | Key Files |
|---|---|---|
| P0 | Domain CRUD | New: `src/app/api/domains/route.ts`, `src/components/DomainForm.tsx` |
| P0 | Department CRUD | New: `src/app/api/departments/route.ts`, `src/components/DepartmentForm.tsx` |
| P0 | User management | New: `src/app/users/`, `src/app/api/users/` |
| P0 | Project CRUD (manual) | New: `src/app/api/projects/route.ts`, `src/components/ProjectForm.tsx` |
| P0 | Access grant UI | New: `src/components/GrantForm.tsx`, `src/app/api/grants/route.ts` |
| P1 | Self-serve onboarding | Sign-up page, workspace creation, invitation emails |
| P1 | Role-based access control | Configurable roles (replace hardcoded superadmin/developer/department_member) |
| P1 | Billing (Stripe) | Stripe integration, pricing tiers |
| P1 | Email notifications | Transactional emails, notification preferences |
| P1 | Data import/export | CSV/JSON export endpoints |

### Phase 3: Growth (3-6 months)

| Priority | Task | Key Files |
|---|---|---|
| P1 | Integration marketplace | Slack, Linear, Jira, Notion webhooks |
| P1 | Public REST API | API key auth, rate limiting, documentation |
| P2 | White-label branding | Custom domain, logo, colors per tenant |
| P2 | Advanced analytics | Charts, trends, forecasting |
| P2 | AI enhancements | Smart inbox routing, anomaly detection |
| P2 | Mobile app | React Native or PWA |
| P2 | SOC 2 compliance | Audit log retention policies, encryption certifications |

### Pricing Model

| Tier | Price | Features |
|---|---|---|
| Starter | Free | 1 domain, 3 users, 10 projects, basic sync |
| Growth | $29/mo/seat | Unlimited domains, 20 users, all integrations, AI Discover |
| Pro | $99/mo/seat | Unlimited everything, white-label, API access, priority support |
| Enterprise | Custom | On-premise, SAML/SSO, dedicated support, custom integrations |

---

## 15. Code Quality Notes

### What's Good (Keep Doing This)

1. **Clean separation of concerns** — lib/ (business logic) → app/ (routes) → components/ (UI)
2. **Self-documenting code** — Function and file names tell you what they do
3. **Excellent comments** — Every non-trivial function explains WHY, not just WHAT
4. **Proper HTTP status codes** — API routes return meaningful 401/403/404/502
5. **Graceful degradation** — AI Discover falls back to fuzzy matching when Groq is unavailable
6. **Deterministic caching** — Input hash prevents redundant AI calls
7. **Human-in-the-loop** — AI never writes to Project table without approval

### What to Fix

1. **Zero test coverage** — Most critical gap. Start with `__tests__/` for lib/ functions
2. **TypeScript strict mode off** — Enable `"strict": true` in tsconfig.json
3. **No pagination** — `getProjects()`, `getPeople()`, `getInboxMessages()` will break at scale
4. **No loading states** — Users see nothing during data fetch (add loading.tsx files)
5. **No error boundaries** — A crash in one component takes down the entire page
6. **Single-source config** — Sync tokens are env vars (one account per source), but the schema supports many
7. **`any` type in mapProject** — Type it properly

### Consistency Checklist

| Check | Status |
|---|---|
| Tabs vs spaces (2-space indent) | Mixed — standardize |
| String quotes (single vs double) | Mixed — linter may not enforce |
| `.tsx` for React, `.ts` for pure logic | Consistent ✓ |
| Server actions in `actions.ts` | Consistent ✓ |
| Tailwind classes throughout | Consistent ✓ |
| Dates as ISO strings across server/client boundary | Consistent ✓ |

---

> **How to use this document:** When an AI agent receives a task, it should:
> 1. Check Section 2 for setup and conventions
> 2. Look up the relevant Module section (6-11) to understand the current code
> 3. Find the task in Sections 12-13 for exact file paths and implementation instructions  
> 4. Follow the patterns in Section 5 (coding conventions)
> 5. Read the referenced files before making changes

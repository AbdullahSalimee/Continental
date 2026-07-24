# TODO — Continental OS

> Observation-first management dashboard. Minimal manual input. Maximum auto-discovery.

---

## Priority: Critical (must fix first)

### 1. Fix the sync system (currently broken/confusing)

Each sync source is an **independent project feed** — not a validator of another.

#### 1a. Vercel sync (`/api/sync/vercel`)
- [ ] Bring ALL projects from Vercel account (not just "live" ones — include `broken`, `building`, `ready`, etc.)
- [ ] Show Vercel-assigned status in the registry (currently hardcoded to "live")
- [ ] Track which Vercel email/account the project belongs to
- [ ] Don't just dump into "Unassigned" — show what was found clearly

#### 1b. GitHub sync (`/api/sync/github`)
- [ ] **BUG:** Only matches repos to existing projects by name — does NOT create projects for new repos. If repo name differs from Vercel project name, it's skipped entirely
- [ ] Fix: GitHub sync should create a project in "Unassigned" for EVERY repo (like Vercel sync does), not just match existing ones
- [ ] Show which repos were discovered (currently says "2 matched" with no detail)
- [ ] Show all repos found vs how many were created vs matched

#### 1c. Supabase sync (`/api/sync/supabase`)
- [ ] Pull ALL Supabase projects — not just ones matching by name
- [ ] Show the actual database IDs/project refs discovered
- [ ] Track which Supabase account/email the DB belongs to

#### 1d. Synchronous issue
- [ ] Each sync currently hides results behind a vague message. Show a table of what was found.
- [ ] Replace three confusing sync buttons with one unified "Discover" action

### 2. Unified "Discovered Projects" view

- [ ] A single page showing everything auto-detected from all sources (Vercel + GitHub + Supabase)
- [ ] Columns: Project name | Discovered from | Source account (email) | Status | Live URL | Repo URL | Database ref | Branch assignment
- [ ] From this view, one-click assign to branch
- [ ] No duplicates — if same name found in Vercel + GitHub, merge into one row

### 3. Project-to-Branch assignment

- [ ] In Project Registry, every unassigned project needs a "Move to branch" dropdown
- [ ] Assignment is the ONLY manual step in the core flow
- [ ] Branch dashboards update automatically based on real assignments

### 4. Account sprawl support

- [ ] Sync config UI: "Add Vercel account → paste token → label it (e.g. 'remake-labs+vercel1') → done"
- [ ] Same for GitHub, Supabase, Google
- [ ] `ExternalAccount` model already supports this — just needs UI + wiring
- [ ] Each discovered project shows which account (email) it came from

---

## Priority: High (core features)

### 5. Branch detail page

- [ ] Each branch has its own detail page showing branch-specific data
- [ ] KDH: projects count | team members | profit entries | **LeadFlow embedded view** | departments
- [ ] Remakes Labs: projects count | team members | profit entries | **no client section**
- [ ] Fiverr: placeholder until launched
- [ ] Unassigned: shows all unassigned projects with assign actions

### 6. LeadFlow as external integration (NOT a tab in Continental)

- [ ] LeadFlow is a **separate deployed website with its own database**
- [ ] Continental should fetch/display LeadFlow data from its external API (read-only)
- [ ] LeadFlow is a **department of KDH**, not a top-level nav item
- [ ] Remove the standalone `/leadflow` page
- [ ] Show LeadFlow data within KDH branch detail view
- [ ] Implement API client to pull leads from external LeadFlow DB

### 7. Remakes Labs — no clients

- [ ] Remakes Labs has no client relationships. Client field should not appear for its projects
- [ ] Different branch types may have different fields — make the model flexible, not conditional logic

### 8. Seed data

- [x] Real branches: KDH, Remakes Labs, Fiverr, Unassigned
- [x] Real people: Abdullah, Furqan, Arslan, Sukhran, Jazil
- [x] Real emails (not `.internal` fake addresses)
- [x] Login page updated (no more demo accounts section)
- [ ] Re-seed the database: `npx prisma db push && npx prisma db seed`

---

## Priority: Medium (AI features — replace manual work)

### 9. AI: Auto-assign synced projects to branches

- [ ] AI reads project name/repo description and suggests which branch it belongs to
- [ ] User gets a suggestion, one-click confirms
- [ ] Replaces scrolling through a dropdown every time

### 10. AI: Inbox → project inference

- [ ] AI reads email subject/body and auto-tags which project it's about
- [ ] Uses the existing `inferredProjectId` field on `InboxMessage`

### 11. AI: Natural language branch summaries

- [ ] "What happened in KDH this week?"
- [ ] AI summarizes: new projects, sync status, drift flags, profit entries
- [ ] Replaces needing to click 4 different tabs

### 12. AI: Anomaly detection (beyond hardcoded drift)

- [ ] Learns normal patterns: "This project usually deploys every 3 days, it's been 14"
- [ ] Flags unusual behavior instead of relying on a fixed 60-day stale check

---

## Priority: Low (defer until felt)

- [ ] Manual CRUD forms (add/edit/delete branches, departments, people)
- [ ] Profit entry management UI
- [ ] Focus note editing UI
- [ ] Inbox account management UI
- [ ] External account management UI
- [ ] Access grant management UI

---

## Guiding principle

> If a field can't be auto-detected, ask whether it should exist at all.

Continental is an **observation dashboard**, not a data entry app. Every form and input should justify its existence by answering: "Would I touch this weekly?" If not, it's noise.

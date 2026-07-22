# Features To Add

> Track features that are missing or need to be built. Add items as we discover gaps.

---

## Status Legend
- `[ ]` = Not started
- `[x]` = Done

---

## ── Most Important (critical path) ──────────────────────────────

### 1. Replace dummy seed data with real data
- [ ] Update `prisma/seed.ts` with real branches, people, and structure (no fake `.internal` emails or `.example.com` URLs)
- [ ] **Real Branches:**
  - `KDH (Kasur Digital Hub)` — digitizing local businesses in Kasur, Pakistan
  - `Remakes Labs` — builds alternative versions of popular websites then markets them; **no clients**, no client field needed; creative/experimental branch type
  - `Fiverr` — coming soon
  - `Unassigned` — holding area for auto-detected projects
- [ ] **Real People:**
  - Abdullah Arif (Co-owner) — abdullaharifsalimee@gmail.com — superadmin
  - Furqan Ahmed (Co-owner) — furqanahmed1872@gmail.com — superadmin
  - Arslan Ahmed (Developer + Lead dept) — drmuhammadarifsaleemi@gmail.com — developer
  - Sukhran (Leads) — abdulrehmanch4230@gmail.com — department_member
  - Jazil Sardar (Leads) — jazilansari12@gmail.com — department_member
- [ ] Remove seeded demo accounts info from login page (`src/app/login/page.tsx`)
- [ ] Set a new shared dev password (replace `continental-demo`)

### 2. Auto-fetch projects from Vercel & assign to branches
- [ ] The Vercel sync (`/api/sync/vercel`) already works — auto-fetches projects into "Unassigned"
- [ ] **Project Registry UI must allow assigning any project to any branch** (dropdown on each project row or a modal)
- [ ] Branch overview pages must reflect **actual project counts** based on assignment, not hardcoded seed data
- [ ] When a new project appears in Vercel → sync picks it up → lands in "Unassigned" → user assigns it to correct branch → branch dashboard updates automatically

### 3. Remakes Labs — different branch type (no clients)
- [ ] Remakes Labs branches don't have clients — the Client column/field should be hidden or optional per branch
- [ ] Different branch types may need different forms/fields (e.g., Remakes Labs ≠ KDH ≠ Fiverr)
- [ ] The branch model/system should be flexible to support heterogeneous branch types

### 4. LeadFlow is a separate deployed website, NOT a tab in Continental
- [ ] LeadFlow is already deployed as its own website with its own database
- [ ] **Continental should fetch/display LeadFlow data** from that external source (read-only or cached view), not manage leads internally
- [ ] LeadFlow is a **department of KDH** branch, not a separate module at the top level
- [ ] Remove the standalone LeadFlow page at `/leadflow`; instead show LeadFlow data within the KDH branch detail view
- [ ] Implement an API integration to pull lead data from the external LeadFlow database/API

### 5. Branch detail page overhaul
- [ ] Each branch should have its own dedicated detail page showing branch-specific data
- [ ] KDH detail page shows: projects count, team members, profit entries, **LeadFlow embedded view**, departments
- [ ] Remakes Labs detail page shows: projects count, team members, profit entries, **no client section**
- [ ] Branch detail page must be dynamic based on branch type/attributes

### 6. Project-to-Branch assignment in sync flow
- [x] Synced projects already land in "Unassigned" branch
- [ ] Add a "Move to branch" action in Project Registry UI
- [ ] Automatically match projects to branches by naming conventions or rules
- [ ] Update SyncStamp to track which branch a project was assigned to after sync

---

## Branch CRUD
- [ ] Add new branches (UI + server action)
- [ ] Edit branch details (name, focus, notes)
- [ ] Delete/archive branches

## Department CRUD
- [ ] Add/edit/delete departments within branches

## Person / User Management
- [ ] Add new users
- [ ] Edit users (name, email, role)
- [ ] Assign users to branches and departments
- [ ] Change/reset passwords
- [ ] Deactivate users

## Project Management
- [ ] Create projects manually from UI
- [ ] Edit project details (name, status, branch, owners, etc.)
- [ ] Delete projects



## Access Grant Management
- [ ] Grant access to a user from UI (target: project/branch/department)
- [ ] Set access level (owner/editor/viewer)
- [ ] Set expiration date on grants
- [ ] Revoke access

## Profit Entry Management
- [ ] Add profit entries per branch (amount, currency, note)
- [ ] Edit/delete profit entries

## Focus Note Management
- [ ] Edit branch focus notes

## Client Management
- [ ] Add/edit clients
- [ ] Delete clients

## External Account Management
- [ ] Add external accounts (Vercel, GitHub, Supabase, Google)
- [ ] Link accounts to owners
- [ ] Share accounts with other users

## Inbox Account Management
- [ ] Add/connect inbox accounts
- [ ] Link inbox to projects

## Smart Sync
- [ ] Map synced projects to correct branch instead of "Unassigned"
- [ ] Configure sync source per branch

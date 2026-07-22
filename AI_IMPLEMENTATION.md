# AI Implementation — Continental OS

> One unified sync → one AI pass → perfect project registry.

---

## Problem this solves

Currently, the 3 sync buttons (Vercel, GitHub, Supabase) run independently and create **duplicate projects** in the database because they match only by exact name:

```
Vercel sync creates:   "Taste"      (project ID: abc, branch: Unassigned)
GitHub sync creates:   "taste-app"  (project ID: xyz, branch: Unassigned)

Result: TWO projects in the registry table — same actual project, two rows.
```

Vercel and GitHub often use different naming conventions for the same project:
- Vercel: `taste` → GitHub: `taste-app`
- Vercel: `al-shifa` → GitHub: `al-shifa-clinic-website`
- Vercel: `AMS` → GitHub: `academy-management-system`

Each sync source also brings different data:
- Vercel has the live URL and hosting status
- GitHub has the repo URL, description, and language
- Supabase has the database reference

**None of them know about each other.** The AI must look across all sources and figure out which items are the same project, then merge them into one complete record.

## Overview

Replace the 3 separate sync buttons (Vercel, GitHub, Supabase) + manual branch assignments with a **single "Discover" button** that:

1. Fetches everything from all connected sources
2. Hands the raw data to an AI pass
3. AI matches cross-platform projects, assigns branches, fills details
4. Shows a clean result table for one-click approval

Free-tier friendly: each sync run uses ~400-600 tokens total.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (ProjectRegistryClient)          │
│  [ One "Discover" button ]  →  POST /api/discover           │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/discover                                         │
│                                                              │
│  Step 1: Fetch from all sources (parallel)                   │
│    ├── GET from Vercel API     ───  VercelProject[]          │
│    ├── GET from GitHub API     ───  GitHubRepo[]             │
│    └── GET from Supabase API   ───  SupabaseProject[]        │
│                                                              │
│  Step 2: Normalize into unified format                       │
│    └── DiscoveredItem[] (source-agnostic)                    │
│                                                              │
│  Step 3: Pass to AI for reconciliation                      │
│    └── POST /api/ai/reconcile  ←  DiscoveredItem[]           │
│         → returns: AIResult[]                                │
│                                                              │
│  Step 4: Apply AI results to database                       │
│    └── Create/update projects, sync stamps, branches         │
│                                                              │
│  Step 5: Return full result to frontend                     │
│    └── { created, matched, unassigned, suggestions[] }       │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### Raw source types (what each API returns)

```typescript
// From Vercel API: GET /v9/projects
interface VercelRawProject {
  name: string;              // e.g. "taste"
  id: string;                // Vercel project ID
  status: string;            // "ready" | "building" | "error" | ...
  targets?: {
    production?: {
      alias?: string[];      // e.g. ["taste.vercel.app"]
    }
  };
  framework?: string;        // e.g. "nextjs"
  updatedAt: number;         // unix timestamp
}

// From GitHub API: GET /orgs/{org}/repos
interface GitHubRawRepo {
  name: string;              // e.g. "taste-app"
  full_name: string;         // e.g. "AbdullahSalimee/taste-app"
  html_url: string;          // e.g. "https://github.com/AbdullahSalimee/taste-app"
  description: string | null;
  language: string | null;   // e.g. "TypeScript"
  pushed_at: string;         // ISO date
  archived: boolean;
}

// From Supabase API: GET /v1/projects
interface SupabaseRawProject {
  id: string;                // project ref, e.g. "wigespbhglwvtvwirwbt"
  name: string;
  organization_id: string;
  created_at: string;
}
```

### Normalized item (what AI receives)

```typescript
interface DiscoveredItem {
  id: string;                // unique per sync run
  source: "vercel" | "github" | "supabase" | "manual";
  name: string;              // original name from source
  sourceAccountLabel: string; // which connected account it came from
  url?: string;              // live URL or repo URL
  status?: string;           // raw status from source
  description?: string;      // GitHub description, etc.
  language?: string;         // for GitHub repos
  raw: Record<string, any>;  // original API response for AI context
}
```

### AI result (what AI returns)

```typescript
interface AIResult {
  // === Cross-source matching ===
  // Groups of items that AI determined are the same project
  matches: Array<{
    confidence: number;       // 0.0 - 1.0
    items: DiscoveredItem[];  // items from different sources merged
    suggestedName: string;    // canonical name
  }>;

  // === Standalone items (no cross-source match) ===
  standalone: Array<{
    item: DiscoveredItem;
    reason: string;           // e.g. "GitHub-only project, not deployed"
  }>;

  // === Branch assignment ===
  branchAssignments: Array<{
    itemId: string;
    suggestedBranchId: string;
    confidence: number;
  }>;

  // === Project details ===
  projectDetails: Array<{
    itemId: string;
    suggestedDescription: string;
    suggestedStatus: "live" | "in_development" | "archived" | "broken" | "demo_only";
  }>;
}
```

---

## AI Prompt Design (token-minimized)

### Prompt 1: Cross-source matching

```
You are matching projects across Vercel, GitHub, and Supabase.
Rules:
- Ignore case, hyphens, spaces, common suffixes (-app, -web, -site, -repo, -prod)
- "Al Shifa" ≅ "al-shifa" ≅ "al-shifa-clinic"
- "AMS" ≅ "academy-management-system"
- Output EXACTLY one JSON line per group

Input:
{items: [...all discovered items serialized minimally]}

Output format (JSON array):
[{
  "indices": [0, 2, 5],    // indexes into input array
  "name": "canonical-name",
  "confidence": 0.95
}]
```

### Prompt 2: Branch assignment

```
Assign these projects to branches.
Branches: KDH, Remakes Labs, Fiverr, Unassigned
Rules:
- Projects about local business, clinics, academies → KDH
- Alternative versions of popular websites, consumer apps → Remakes Labs
- Freelance/service work → Fiverr
- Unknown → Unassigned

Input:
{projects: [...project names + descriptions minimally]}

Output format (JSON array):
[{
  "index": 0,
  "branch": "KDH",
  "confidence": 0.9
}]
```

### Estimated token usage

| Step | Input tokens | Output tokens |
|---|---|---|
| Match prompt | ~50 (instructions) + ~20 per item | ~10 per group |
| Branch prompt | ~60 (instructions) + ~10 per project | ~8 per project |
| **For 14 Vercel + 14 GitHub + 3 Supabase (31 items)** | **~50 + ~620 = ~670** | **~200** |
| **Total per sync** | | **~870 tokens** |

At ~870 tokens per sync, with 10 syncs daily = **~8,700 tokens/day**. Free tier of most AI models (Gemini Flash, Claude Haiku) handles this easily.

---

## Implementation Steps

### Step 1: Create `/api/discover` route

**File:** `src/app/api/discover/route.ts`

This is the **single endpoint** called by the UI's "Discover" button.

What it does:
1. Authorizes the request (superadmin or cron secret)
2. In parallel, calls all configured sync sources:
   - Vercel API (`GET /v9/projects`)
   - GitHub API (`GET /orgs/{org}/repos` or `/users/{user}/repos`)
   - Supabase API (`GET /v1/projects`)
3. Normalizes each response into `DiscoveredItem[]`
4. Passes the full array to `/api/ai/reconcile`
5. Applies AI results to the database:
   - For each match group: creates/updates a `Project`, links sync stamps, connects external accounts
   - For standalone items: creates a `Project` in suggested branch
   - Records AI decisions in a new `AIDecision` model (for audit trail)
6. Returns the full result to the frontend

```typescript
// Pseudocode
export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok) return NextResponse.json({...}, { status: 401 });

  // Step 1: Fetch all sources in parallel
  const [vercelItems, githubItems, supabaseItems] = await Promise.all([
    fetchVercelProjects(),
    fetchGitHubRepos(),
    fetchSupabaseProjects(),
  ]);

  const allItems = [...vercelItems, ...githubItems, ...supabaseItems];

  // Step 2: AI reconciliation
  const aiResult = await fetchAIReconciliation(allItems);

  // Step 3: Apply to database
  const dbResult = await applyAIResult(aiResult);

  return NextResponse.json({
    ok: true,
    sourcesChecked: { vercel: vercelItems.length, github: githubItems.length, supabase: supabaseItems.length },
    created: dbResult.created,
    matched: dbResult.matched,
    unassigned: dbResult.unassigned,
    suggestions: dbResult.suggestions,
  });
}
```

### Step 2: Create `/api/ai/reconcile` route

**File:** `src/app/api/ai/reconcile/route.ts`

This is the **AI gateway**. It:
1. Receives `DiscoveredItem[]`
2. Picks the configured AI provider from env (`AI_PROVIDER`, `AI_API_KEY`)
3. Runs Prompt 1 (matching)
4. Runs Prompt 2 (branch assignment)
5. Assembles and returns `AIResult`
6. Falls back to simple fuzzy matching if AI is not configured

```typescript
// Pseudocode
export async function POST(req: Request) {
  const { items } = await req.json();
  
  if (!process.env.AI_API_KEY) {
    // Fallback: simple fuzzy matching only, no AI
    return fallbackFuzzyMatch(items);
  }

  const provider = process.env.AI_PROVIDER ?? "openai"; // or "gemini" | "anthropic"
  
  // Step 1: Match items across sources
  const matchResult = await callAI(matchPrompt(items), provider);
  
  // Step 2: Assign branches
  const branchResult = await callAI(branchPrompt(matchResult.matches), provider);
  
  return assembleResult(matchResult, branchResult);
}
```

### Step 3: Update the frontend

**File:** `src/components/ProjectRegistryClient.tsx`

Changes:
- Replace "sync vercel", "sync github", "sync supabase" buttons with **one "Discover" button**
- After discover runs, show a summary banner:
  - "Found 17 items. AI matched 12 into 5 projects. 3 assigned to KDH, 1 to Remakes Labs, 1 to Unassigned."
- Show a "pending suggestions" section for low-confidence items where AI wants confirmation

```typescript
// New button in ProjectRegistryClient
<button onClick={runDiscover} disabled={discovering} className="...">
  {discovering ? "Discovering…" : "Discover"}
</button>
```

### Step 4: Add AI config to .env

```
# AI provider for reconciling sync data
AI_PROVIDER=openai          # openai | gemini | anthropic
AI_API_KEY=sk-...           # API key
AI_MODEL=gpt-4o-mini        # use cheapest model: gpt-4o-mini, gemini-2.0-flash, claude-3-haiku
```

### Step 5: Add AIDecision model to Prisma (for audit trail)

```prisma
model AIDecision {
  id            String   @id @default(cuid())
  syncRunId     String   // groups decisions from one sync run
  action        String   // "match" | "assign_branch" | "suggest_status" | "suggest_description"
  sourceIds     String   // JSON array of source item IDs
  targetProjectId String? // the project created/updated
  suggestion    String   // what AI suggested
  confidence    Float
  accepted      Boolean  @default(false) // user approved or rejected
  createdAt     DateTime @default(now())
}
```

### Step 6: Fallback fuzzy matching (no AI mode)

**File:** `src/lib/fuzzy-match.ts`

When AI is not configured, still provide value:

```typescript
// Simple but effective string similarity for project matching
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]+/g, '')
    .replace(/-(app|web|site|repo|prod|dev)$/, '')
    .replace(/^(app|web|site)-/, '');
}

function fuzzyMatch(a: string, b: string): number {
  return similar(normalize(a), normalize(b)); // > 0.8 = match
}

function assignBranch(name: string, description: string): string {
  const name_lower = name.toLowerCase();
  const desc_lower = description?.toLowerCase() ?? '';
  
  // KDH keywords
  if (/clinic|academy|school|restaurant|bakery|local|business|kasur/.test(name_lower + ' ' + desc_lower))
    return 'kdh';
  
  // Remakes Labs keywords  
  if (/remake|alternative|clone|version\s+of/.test(name_lower + ' ' + desc_lower))
    return 'remakes-labs';
  
  return 'unassigned'; // default
}
```

---

## Frontend: The "Discover" UX

```
Before sync:                                      After sync:
┌──────────────────────────────┐                  ┌──────────────────────────────┐
│ [sync vercel] [sync github]  │                  │ [  🔍  Discover  ]          │
│ [sync supabase]              │                  │                              │
└──────────────────────────────┘                  └──────────────────────────────┘

Result banner after discover:
┌─────────────────────────────────────────────────────────────────┐
│ ✅ Discover complete                                            │
│                                                                │
│   Vercel: 14 projects found                                    │
│   GitHub: 18 repos found                                       │
│   Supabase: 3 projects found                                   │
│                                                                │
│   AI matched 35 items → 19 unique projects                     │
│   ├─ 12 matched across multiple sources ✅                     │
│   ├─ 4 matched with medium confidence ⚠️ (review below)        │
│   └─ 3 standalone (no cross-match)                             │
│                                                                │
│   Branch assignments:                                           │
│   ├─ 11 → KDH                                                  │
│   ├─ 4 → Remakes Labs                                          │
│   ├─ 0 → Fiverr                                               │
│   └─ 4 → Unassigned (needs your input)                        │
│                                                                │
│   [  Accept all  ]  [  Review suggestions  ]  [  Discard  ]    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key design decisions

| Decision | Why |
|---|---|
| **One discover endpoint, not per-source** | AI needs the full picture to match across sources |
| **AI runs server-side, not client** | Tokens are cheaper on server, no CORS issues |
| **AI suggestions are reviewable** | Never trust AI blindly — show confidence levels |
| **Fallback to fuzzy matching** | Works without AI API key, gets better when AI is added |
| **Batch all items in one prompt** | Each prompt has fixed overhead; batching minimizes tokens |
| **AIDecision table for audit** | If AI makes a wrong match, you can trace and fix it |
| **Free-tier models** | Gemini Flash is free for 60 req/min — more than enough |
| **Async + non-blocking** | Discover runs in background, UI polls for result |

---

## Files to create/modify

| File | Action | Purpose |
|---|---|---|
| `src/app/api/discover/route.ts` | **Create** | Single unified discover endpoint |
| `src/app/api/ai/reconcile/route.ts` | **Create** | AI gateway (matching + assignment) |
| `src/lib/ai.ts` | **Create** | AI provider abstraction (OpenAI, Gemini, Anthropic) |
| `src/lib/fuzzy-match.ts` | **Create** | Fallback matching when no AI |
| `src/lib/sync-fetchers.ts` | **Create** | Shared fetchers for Vercel/GitHub/Supabase APIs |
| `src/components/DiscoverButton.tsx` | **Create** | New unified discover button + result banner |
| `src/components/ProjectRegistryClient.tsx` | **Modify** | Replace 3 sync buttons with Discover button |
| `src/app/api/sync/vercel/route.ts` | **Keep** | Still used internally by discover endpoint |
| `src/app/api/sync/github/route.ts` | **Keep** | Still used internally by discover endpoint |
| `src/app/api/sync/supabase/route.ts` | **Keep** | Still used internally by discover endpoint |
| `prisma/schema.prisma` | **Modify** | Add `AIDecision` model |
| `.env` | **Modify** | Add `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` |

---

## Token optimization tips for free-tier models

1. **Use short field names** in prompts: `{n: "name", d: "description"}` instead of `{name: "...", description: "..."}`
2. **Don't send full raw API responses** — extract only: name, description, URL, language
3. **Use structured output** (JSON mode) — less token waste than natural language
4. **Cache identical prompts** — same project names get same results
5. **Rate limit**: add 200ms delay between calls if using free tier (stays under free rate limits)

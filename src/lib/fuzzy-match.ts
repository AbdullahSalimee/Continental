// Deterministic name matching — runs BEFORE any AI call.
//
// Purpose: resolve the easy cases (exact names, common suffix/prefix
// variants like "taste" vs "taste-app") for free and instantly, so the AI
// pass only has to spend tokens/latency on the genuinely ambiguous leftovers
// (cryptic Supabase refs, generic repo names, purpose-based branch guesses).
// This module never talks to the network and always returns the same
// output for the same input.

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[-_\s]+/g, "")
    .replace(/(app|web|site|repo|prod|dev|clinic|website)$/g, "");
}

// Levenshtein distance, used to catch near-misses normalization alone won't
// (typos, "acadmey" vs "academy") without over-matching unrelated names.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// Similarity score 0..1. 1 = identical after normalization.
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;

  // Substring containment (e.g. "amshq" contains "ams") is a strong signal.
  if (na.includes(nb) || nb.includes(na)) {
    const longer = Math.max(na.length, nb.length);
    const shorter = Math.min(na.length, nb.length);
    return 0.75 + 0.2 * (shorter / longer);
  }

  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

export const FUZZY_MATCH_THRESHOLD = 0.82;

export interface NamedItem {
  id: string;
  name: string;
}

export interface FuzzyMatchGroup {
  itemIds: string[];
  suggestedName: string;
  confidence: number;
}

// Groups items whose names are similar enough to plausibly be the same
// project across sources. Greedy single-link clustering — fine at this
// scale (tens of items per sync run, not thousands).
export function fuzzyGroup(items: NamedItem[]): {
  groups: FuzzyMatchGroup[];
  ungrouped: NamedItem[];
} {
  const used = new Set<string>();
  const groups: FuzzyMatchGroup[] = [];

  for (let i = 0; i < items.length; i++) {
    if (used.has(items[i].id)) continue;
    const cluster: NamedItem[] = [items[i]];
    used.add(items[i].id);

    for (let j = i + 1; j < items.length; j++) {
      if (used.has(items[j].id)) continue;
      const sim = nameSimilarity(items[i].name, items[j].name);
      if (sim >= FUZZY_MATCH_THRESHOLD) {
        cluster.push(items[j]);
        used.add(items[j].id);
      }
    }

    if (cluster.length > 1) {
      // Confidence = weakest pairwise link in the cluster relative to the anchor.
      const worst = Math.min(
        ...cluster
          .slice(1)
          .map((c) => nameSimilarity(items[i].name, c.name)),
      );
      groups.push({
        itemIds: cluster.map((c) => c.id),
        suggestedName: shortestName(cluster.map((c) => c.name)),
        confidence: Number(worst.toFixed(2)),
      });
    }
  }

  const groupedIds = new Set(groups.flatMap((g) => g.itemIds));
  const ungrouped = items.filter((it) => !groupedIds.has(it.id));

  return { groups, ungrouped };
}

function shortestName(names: string[]): string {
  return names.reduce((a, b) => (b.length < a.length ? b : a));
}

// Keyword-based domain guess — cheap, deterministic, handles the obvious
// cases so AI only has to reason about the ambiguous ones.
//
// Domains are an open/extensible list in this system (see types.ts) — new
// ones can be added at runtime through the app itself. So this can't be a
// hardcoded switch on domain name: it takes the ACTUAL domains that exist
// right now (fetched from the DB by the caller) and only offers a guess for
// ones it recognizes a content pattern for. A brand-new domain with no
// pattern here simply gets no keyword guess — it still goes to the AI step,
// which sees the real domain list and can reason about it directly.
const DOMAIN_KEYWORD_PATTERNS: Record<string, RegExp> = {
  KDH: /clinic|academy|school|restaurant|bakery|kasur|kdh/,
  "Remakes Labs": /remake|alternative|clone|version-of|remakes?[-\s]?labs?/,
  Fiverr: /fiverr|freelance|gig/,
};

export function guessDomainByKeywords(
  name: string,
  description: string | undefined,
  existingDomainNames: string[],
): { domainName: string; confidence: number } | null {
  const text = `${name} ${description ?? ""}`.toLowerCase();

  for (const domainName of existingDomainNames) {
    const pattern = DOMAIN_KEYWORD_PATTERNS[domainName];
    if (pattern && pattern.test(text)) {
      return { domainName, confidence: 0.7 };
    }
  }
  return null;
}
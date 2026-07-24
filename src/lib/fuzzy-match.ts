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
        a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// Builds the initials of a multi-word name, e.g. "Iron Patriot Button" -> "ipb".
// Splits on spaces/hyphens/underscores/camelCase boundaries so it works on
// "Iron Patriot Button", "iron-patriot-button", and "IronPatriotButton" alike.
function initials(name: string): string {
  const withBoundaries = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ");
  const words = withBoundaries
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length < 2) return ""; // acronym logic only makes sense for multi-word names
  return words.map((w) => w[0]).join("");
}

// Similarity score 0..1. 1 = identical after normalization.
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;

  // Acronym/initials match (e.g. "ipb" vs "Iron Patriot Button", "academy
  // management syatem" reduced to its shortform elsewhere). Checked on the
  // ORIGINAL names (pre-normalize) since word boundaries matter here and
  // normalizeName strips separators. A short name that's exactly the
  // initials of a longer multi-word name is as strong a signal as an exact
  // match — someone naming a Vercel/Supabase project "IPB" for "Iron
  // Patriot Button" is deliberately using shorthand, not coincidence.
  const shortRaw = a.length <= b.length ? a : b;
  const longRaw = a.length <= b.length ? b : a;
  const shortNorm = normalizeName(shortRaw);
  if (shortNorm.length >= 2 && shortNorm.length <= 6) {
    if (initials(longRaw) === shortNorm) return 0.95;
  }

  // Substring containment (e.g. "amshq" contains "ams") is a strong signal.
  // A containment where the short name lands on a clean word boundary in
  // the long name (a real prefix/word match, like "academy" leading
  // "academy management syatem") is a much stronger signal than an
  // incidental mid-word substring — score it near the acronym tier instead
  // of scaling down by length ratio, which unfairly punishes short-vs-long
  // pairs like "academy" (7 chars) vs a 23-char full name.
  if (na.includes(nb) || nb.includes(na)) {
    const longer = na.length >= nb.length ? na : nb;
    const shorter = na.length >= nb.length ? nb : na;
    const isWordBoundaryMatch = longer.startsWith(shorter);
    if (isWordBoundaryMatch && shorter.length >= 4) {
      return 0.9;
    }
    return 0.75 + 0.2 * (shorter.length / longer.length);
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
// project across sources. Grows each cluster against ANY current member,
// not just the first item added to it — plain single-link-to-anchor
// clustering misses transitive chains (e.g. "academy" matches both
// "Academy Management Syatem" AND "superioracademy" strongly, but the
// latter two don't score high enough against EACH OTHER directly; without
// checking against every member, whichever of them isn't compared to the
// anchor first gets left out even though it's clearly the same project via
// the middle item). Still fine at this scale (tens of items per sync run,
// not thousands) — worst case is O(n^2) comparisons either way.
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

    // Repeat until a full pass adds nothing new — lets a late addition
    // (matched via some other member, not the anchor) pull in further
    // items that only match IT, chaining transitively.
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(items[j].id)) continue;
        const matchesSomeMember = cluster.some(
          (member) =>
            nameSimilarity(member.name, items[j].name) >= FUZZY_MATCH_THRESHOLD,
        );
        if (matchesSomeMember) {
          cluster.push(items[j]);
          used.add(items[j].id);
          grew = true;
        }
      }
    }

    if (cluster.length > 1) {
      // Confidence = weakest link between consecutive members in the order
      // they were added — a reasonable proxy for "how strong is the
      // chain" without recomputing full pairwise min over the cluster.
      const worst = Math.min(
        ...cluster
          .slice(1)
          .map((c, idx) => nameSimilarity(cluster[idx].name, c.name)),
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

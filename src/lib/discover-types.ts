import crypto from "crypto";

export interface DiscoveredItem {
  id: string; // stable within a single run, e.g. "vercel:0"
  source: "vercel" | "github" | "supabase" | "netlify";
  name: string;
  accountLabel: string;
  url?: string;
  status?: string;
  description?: string;
  language?: string;
  databaseRef?: string;
}

export interface MatchSuggestion {
  itemIds: string[];
  suggestedName: string;
  confidence: number;
  method: "exact" | "fuzzy" | "ai";
  reasoning?: string;
}

export interface DomainSuggestion {
  itemId: string; // or a synthetic group id for matched clusters
  suggestedDomainName: string;
  confidence: number;
  method: "keyword" | "ai";
  reasoning?: string;
}

export interface FieldSuggestion {
  itemId: string;
  suggestedStatus?: string;
  suggestedDescription?: string;
  confidence: number;
  method: "ai";
  reasoning?: string;
}

export interface ReconciliationResult {
  matches: MatchSuggestion[];
  standalone: DiscoveredItem[];
  domainSuggestions: DomainSuggestion[];
  fieldSuggestions: FieldSuggestion[];
  aiUsed: boolean;
  aiError?: string;
}

// Deterministic hash of the normalized item set plus the current domain
// list, used to cache/reuse an AI decision instead of re-calling the model
// for an identical Discover run. Domain names are included so that adding,
// renaming, or removing a branch invalidates the cache — otherwise a
// re-run with the same source data would silently reuse suggestions
// computed against a stale branch list.
export function hashItems(
  items: DiscoveredItem[],
  domainNames: string[] = [],
): string {
  const normalized = items
    .map(
      (i) =>
        `${i.source}:${i.name}:${i.description ?? ""}:${i.databaseRef ?? ""}`,
    )
    .sort()
    .join("|");
  const domainKey = [...domainNames].sort().join(",");
  return crypto
    .createHash("sha256")
    .update(normalized + "||domains:" + domainKey)
    .digest("hex");
}

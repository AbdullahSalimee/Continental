import crypto from "crypto";

export interface DiscoveredItem {
  id: string; // stable within a single run, e.g. "vercel:0"
  source: "vercel" | "github" | "supabase";
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

export interface BranchSuggestion {
  itemId: string; // or a synthetic group id for matched clusters
  suggestedBranchName: string;
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
  branchSuggestions: BranchSuggestion[];
  fieldSuggestions: FieldSuggestion[];
  aiUsed: boolean;
  aiError?: string;
}

// Deterministic hash of the normalized item set, used to cache/reuse an AI
// decision instead of re-calling the model for an identical Discover run.
export function hashItems(items: DiscoveredItem[]): string {
  const normalized = items
    .map(
      (i) =>
        `${i.source}:${i.name}:${i.description ?? ""}:${i.databaseRef ?? ""}`,
    )
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

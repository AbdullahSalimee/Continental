import { callGroqJSON, extractJSON, isAIConfigured } from "./ai";
import { prisma } from "./prisma";
import { fuzzyGroup, guessBranchByKeywords } from "./fuzzy-match";
import type {
  DiscoveredItem,
  MatchSuggestion,
  BranchSuggestion,
  FieldSuggestion,
  ReconciliationResult,
} from "./discover-types";

// Orchestrates one Discover run:
//   1. Exact-name grouping (free, instant)
//   2. Fuzzy grouping on what's left (free, instant)
//   3. Keyword branch guesses on what's left (free, instant)
//   4. Whatever is STILL ambiguous after 1-3 goes to Groq in one batched
//      call, asking it to match + assign branch + infer status/description.
//      If Groq is unconfigured or the call fails, we skip step 4 entirely —
//      Discover still completes using only the deterministic results.
export async function reconcile(
  items: DiscoveredItem[],
): Promise<ReconciliationResult> {
  const matches: MatchSuggestion[] = [];
  const branchSuggestions: BranchSuggestion[] = [];
  const fieldSuggestions: FieldSuggestion[] = [];

  // Branches are an open/extensible list (new ones can be added through the
  // app at runtime) — always read the real set from the DB rather than
  // hardcoding names, so a newly-added branch is immediately eligible for
  // both keyword guesses and AI branch suggestions.
  const existingBranches = await prisma.branch.findMany({
    select: { name: true },
  });
  const branchNames = existingBranches.map((b) => b.name);

  // Step 1: exact name match (case/whitespace-insensitive)
  const byExactName = new Map<string, DiscoveredItem[]>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (!byExactName.has(key)) byExactName.set(key, []);
    byExactName.get(key)!.push(item);
  }

  const exactMatched = new Set<string>();
  for (const group of byExactName.values()) {
    if (group.length > 1) {
      matches.push({
        itemIds: group.map((g) => g.id),
        suggestedName: group[0].name,
        confidence: 1,
        method: "exact",
      });
      group.forEach((g) => exactMatched.add(g.id));
    }
  }

  const remainingAfterExact = items.filter((i) => !exactMatched.has(i.id));

  // Step 2: fuzzy name match on the rest
  const { groups: fuzzyGroups, ungrouped: afterFuzzy } = fuzzyGroup(
    remainingAfterExact.map((i) => ({ id: i.id, name: i.name })),
  );
  const fuzzyMatched = new Set<string>();
  for (const g of fuzzyGroups) {
    matches.push({
      itemIds: g.itemIds,
      suggestedName: g.suggestedName,
      confidence: g.confidence,
      method: "fuzzy",
    });
    g.itemIds.forEach((id) => fuzzyMatched.add(id));
  }

  const byId = new Map(items.map((i) => [i.id, i]));

  // Step 3: keyword branch guesses on every item not yet grouped (grouped
  // items get their branch guessed too, from the "anchor" item's text)
  for (const item of items) {
    const guess = guessBranchByKeywords(
      item.name,
      item.description,
      branchNames,
    );
    if (guess) {
      branchSuggestions.push({
        itemId: item.id,
        suggestedBranchName: guess.branchName,
        confidence: guess.confidence,
        method: "keyword",
      });
    }
  }

  const keywordGuessedIds = new Set(branchSuggestions.map((b) => b.itemId));

  // Step 4: whatever is still ambiguous — no fuzzy/exact match AND no
  // keyword branch guess, or has a cryptic name (e.g. Supabase refs) — goes
  // to Groq. This keeps the AI call small and cheap.
  const stillAmbiguous = items.filter((i) => {
    const noMatch = !exactMatched.has(i.id) && !fuzzyMatched.has(i.id);
    const noBranchGuess = !keywordGuessedIds.has(i.id);
    return noMatch || noBranchGuess;
  });

  if (stillAmbiguous.length === 0 || !isAIConfigured()) {
    const standalone = items.filter(
      (i) => !exactMatched.has(i.id) && !fuzzyMatched.has(i.id),
    );
    return {
      matches,
      standalone,
      branchSuggestions,
      fieldSuggestions,
      aiUsed: false,
      aiError: isAIConfigured() ? undefined : "GROQ_API_KEY not configured",
    };
  }

  const aiResult = await callGroqReconcile(stillAmbiguous, branchNames);

  if (!aiResult.ok) {
    const standalone = items.filter(
      (i) => !exactMatched.has(i.id) && !fuzzyMatched.has(i.id),
    );
    return {
      matches,
      standalone,
      branchSuggestions,
      fieldSuggestions,
      aiUsed: false,
      aiError: aiResult.error,
    };
  }

  // Merge AI matches in (AI operates only on the "stillAmbiguous" subset)
  for (const m of aiResult.matches) {
    if (m.itemIds.length > 1) {
      matches.push(m);
      m.itemIds.forEach((id) => fuzzyMatched.add(id)); // reuse set to mark "grouped"
    }
  }
  branchSuggestions.push(...aiResult.branchSuggestions);
  fieldSuggestions.push(...aiResult.fieldSuggestions);

  const standalone = items.filter(
    (i) => !exactMatched.has(i.id) && !fuzzyMatched.has(i.id),
  );

  return {
    matches,
    standalone,
    branchSuggestions,
    fieldSuggestions,
    aiUsed: true,
  };
}

interface GroqReconcileOutput {
  matches: MatchSuggestion[];
  branchSuggestions: BranchSuggestion[];
  fieldSuggestions: FieldSuggestion[];
}

async function callGroqReconcile(
  items: DiscoveredItem[],
  branchNames: string[],
): Promise<
  ({ ok: true } & GroqReconcileOutput) | { ok: false; error: string }
> {
  const systemPrompt = `You reconcile project data discovered across Vercel, GitHub, and Supabase for a small company's internal dashboard. You will be given a JSON array of items with an index-based id. Respond with ONLY a raw JSON object, no markdown, no commentary, matching exactly this shape:
{
  "matches": [{ "itemIds": ["<id>", "<id>"], "suggestedName": "string", "confidence": 0.0-1.0, "reasoning": "short reason" }],
  "branchSuggestions": [{ "itemId": "<id>", "suggestedBranchName": "<one of the branch names given below>", "confidence": 0.0-1.0, "reasoning": "short reason" }],
  "fieldSuggestions": [{ "itemId": "<id>", "suggestedStatus": "live | broken | in_development | archived | demo_only", "suggestedDescription": "one short sentence", "confidence": 0.0-1.0, "reasoning": "short reason" }]
}
Available branches (suggest ONLY from this exact list — never invent a branch name): ${branchNames.join(", ") || "(none configured yet)"}

Rules:
- Only include a match group if you are reasonably confident (>0.5) the items are the SAME real-world project across different sources. Do not merge items just because they share a generic word.
- Only suggest a branch if there's a real content signal (business type, description, purpose) AND it's one of the available branches listed above. Otherwise omit it — do not guess randomly, and never suggest a branch name that isn't in that list.
- Omit any array entirely if you have nothing confident to say.
- confidence reflects your actual certainty, not a fixed number.`;

  const userPrompt = JSON.stringify(
    items.map((i) => ({
      id: i.id,
      source: i.source,
      name: i.name,
      description: i.description,
      language: i.language,
      databaseRef: i.databaseRef,
    })),
  );

  const result = await callGroqJSON(systemPrompt, userPrompt);
  if (!result.ok || !result.text) {
    return { ok: false, error: result.error ?? "empty response from Groq" };
  }

  const parsed = extractJSON<Partial<GroqReconcileOutput>>(result.text);
  if (!parsed) {
    return { ok: false, error: "Groq returned unparseable JSON" };
  }

  const validItemIds = new Set(items.map((i) => i.id));

  const matches = (parsed.matches ?? [])
    .filter((m) => m.itemIds?.every((id) => validItemIds.has(id)))
    .map((m) => ({ ...m, method: "ai" as const }));

  const branchSuggestions = (parsed.branchSuggestions ?? [])
    .filter(
      (b) =>
        validItemIds.has(b.itemId) &&
        branchNames.includes(b.suggestedBranchName),
    )
    .map((b) => ({ ...b, method: "ai" as const }));

  const fieldSuggestions = (parsed.fieldSuggestions ?? [])
    .filter((f) => validItemIds.has(f.itemId))
    .map((f) => ({ ...f, method: "ai" as const }));

  return { ok: true, matches, branchSuggestions, fieldSuggestions };
}

import { callGrokJSON, extractJSON, isAIConfigured } from "./ai";
import { fuzzyGroup, guessBranchByKeywords } from "./fuzzy-match";
import type {
  DiscoveredItem,
  MatchSuggestion,
  BranchSuggestion,
  FieldSuggestion,
  ReconciliationResult,
} from "./discover-types";

const KNOWN_BRANCHES = ["KDH", "Remakes Labs", "Fiverr"];

// Orchestrates one Discover run:
//   1. Exact-name grouping (free, instant)
//   2. Fuzzy grouping on what's left (free, instant)
//   3. Keyword branch guesses on what's left (free, instant)
//   4. Whatever is STILL ambiguous after 1-3 goes to Grok in one batched
//      call, asking it to match + assign branch + infer status/description.
//      If Grok is unconfigured or the call fails, we skip step 4 entirely —
//      Discover still completes using only the deterministic results.
export async function reconcile(
  items: DiscoveredItem[],
): Promise<ReconciliationResult> {
  const matches: MatchSuggestion[] = [];
  const branchSuggestions: BranchSuggestion[] = [];
  const fieldSuggestions: FieldSuggestion[] = [];

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
    const guess = guessBranchByKeywords(item.name, item.description);
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

  // Step 4: whatever is still ambiguous goes to Groq. IMPORTANT: "ambiguous"
  // means no match was found at all — an item that was ALREADY matched by
  // exact or fuzzy name must never be re-sent, even if it doesn't have a
  // branch guess yet, otherwise Groq re-litigates settled matches (wastes
  // tokens and can produce a second, possibly different, confidence score
  // for something that was already resolved for free).
  const stillAmbiguous = items.filter((i) => {
    const alreadyMatched = exactMatched.has(i.id) || fuzzyMatched.has(i.id);
    const noBranchGuess = !keywordGuessedIds.has(i.id);
    // Escalate to Groq only if: (a) it has no match at all, OR
    // (b) it's unmatched-but-standalone AND still needs a branch guess.
    // A matched item skips Groq's matching job but MAY still want a branch/
    // field suggestion — handled separately below, not by resending it as
    // if it were unmatched.
    return !alreadyMatched;
  });

  // Items that already have a confirmed match but are missing a branch
  // guess still deserve a branch/field suggestion — just not a re-match.
  // These go to Groq too, but tagged so the prompt doesn't ask it to
  // re-decide matching for them.
  const matchedButNeedsBranchOrFields = items.filter((i) => {
    const alreadyMatched = exactMatched.has(i.id) || fuzzyMatched.has(i.id);
    return alreadyMatched && !keywordGuessedIds.has(i.id);
  });

  if (
    (stillAmbiguous.length === 0 &&
      matchedButNeedsBranchOrFields.length === 0) ||
    !isAIConfigured()
  ) {
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

  // Field enrichment (status/description) is asked for on ANY item missing
  // those details — not just unmatched ones. A project can be perfectly
  // matched by exact name and still have no description; that's exactly
  // the "left blank many times" gap this exists to close.
  const needsEnrichment = items.filter((i) => !i.description || !i.status);

  // Union of everyone going into the single Groq call: unmatched items
  // (need matching + branch + fields), matched-but-branch-less items (need
  // branch + fields only), and anyone else missing fields (fields only).
  const groqInputMap = new Map<string, DiscoveredItem>();
  for (const i of stillAmbiguous) groqInputMap.set(i.id, i);
  for (const i of matchedButNeedsBranchOrFields) groqInputMap.set(i.id, i);
  for (const i of needsEnrichment) groqInputMap.set(i.id, i);
  const groqInput = Array.from(groqInputMap.values());

  const alreadyMatchedIds = new Set(
    items
      .map((i) => i.id)
      .filter((id) => exactMatched.has(id) || fuzzyMatched.has(id)),
  );

  const aiResult = await callGroqReconcile(groqInput, alreadyMatchedIds);

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

  // Merge AI matches in — but ONLY for items that weren't already matched.
  // This is the actual fix: even if Groq's prompt somehow still proposes a
  // group containing an already-matched item (it shouldn't, since we tell
  // it which ids are already settled), we defensively drop any such result
  // here rather than trust the model to have followed the instruction.
  for (const m of aiResult.matches) {
    const containsAlreadyMatched = m.itemIds.some((id) =>
      alreadyMatchedIds.has(id),
    );
    if (containsAlreadyMatched) continue; // defensive: never re-litigate a settled match
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

interface GrokReconcileOutput {
  matches: MatchSuggestion[];
  branchSuggestions: BranchSuggestion[];
  fieldSuggestions: FieldSuggestion[];
}

async function callGrokReconcile(
  items: DiscoveredItem[],
  branchNames: string[],
  alreadyMatchedIds: Set<string>,
): Promise<
  ({ ok: true } & GroqReconcileOutput) | { ok: false; error: string }
> {
  const systemPrompt = `You reconcile project data discovered across Vercel, GitHub, and Supabase for a small company's internal dashboard. You will be given a JSON array of items with an index-based id. Some items are marked "alreadyMatched": true — these have ALREADY been grouped with another item by a separate, more reliable name-matching step. Do NOT propose a match for them and do NOT include them in the "matches" array under any circumstances, even if you think you see a better grouping — that decision is final and out of scope here. You may still suggest a branch or fill in missing fields for them.

Respond with ONLY a raw JSON object, no markdown, no commentary, matching exactly this shape:
{
  "matches": [{ "itemIds": ["<id>", "<id>"], "suggestedName": "string", "confidence": 0.0-1.0, "reasoning": "short reason" }],
  "branchSuggestions": [{ "itemId": "<id>", "suggestedBranchName": "<one of the branch names given below>", "confidence": 0.0-1.0, "reasoning": "short reason" }],
  "fieldSuggestions": [{ "itemId": "<id>", "suggestedStatus": "live | broken | in_development | archived | demo_only", "suggestedDescription": "one short sentence describing what the project actually is/does", "confidence": 0.0-1.0, "reasoning": "short reason" }]
}
Available branches (suggest ONLY from this exact list — never invent a branch name): ${branchNames.join(", ") || "(none configured yet)"}

Rules:
- NEVER include an "alreadyMatched": true item's id in the "matches" array, alone or grouped — see instruction above.
- Only include a NEW match group (for items not already matched) if you are reasonably confident (>0.5) the items are the SAME real-world project across different sources. Do not merge items just because they share a generic word.
- For fieldSuggestions: give your best real guess at status and a one-sentence description for EVERY item that's missing one, using its name/description/language/source as context. A short educated guess (clearly marked with an honest confidence score) is more useful here than omitting it — this data is reviewed by a human before anything is saved, so it's fine to be wrong sometimes as long as confidence reflects that.
- Only suggest a branch if there's a real content signal (business type, description, purpose) AND it's one of the available branches listed above. Otherwise omit it.
- confidence reflects your actual certainty, not a fixed number.`;

  const userPrompt = JSON.stringify(
    items.map((i) => ({
      id: i.id,
      source: i.source,
      name: i.name,
      description: i.description,
      language: i.language,
      databaseRef: i.databaseRef,
      status: i.status,
      alreadyMatched: alreadyMatchedIds.has(i.id),
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
    .filter(
      (m) =>
        m.itemIds?.every((id) => validItemIds.has(id)) &&
        m.itemIds?.every((id) => !alreadyMatchedIds.has(id)), // defensive, see call site too
    )
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

import { callGroqJSON, extractJSON, isAIConfigured } from "./ai";
import {
  fuzzyGroup,
  nameSimilarity,
  FUZZY_MATCH_THRESHOLD,
} from "./fuzzy-match";
import type {
  DiscoveredItem,
  MatchSuggestion,
  DomainSuggestion,
  FieldSuggestion,
  ReconciliationResult,
} from "./discover-types";

// Orchestrates one Discover run:
//   1. Exact-name grouping (free, instant) — is this the same project as
//      another item, by identical name?
//   2. Fuzzy grouping on what's left (free, instant) — same question,
//      allowing near-identical names.
//   3. EVERY resulting project — whether it came out of step 1/2 as a
//      matched group, or is standing alone as its own project — goes to
//      Groq in one batched call. Groq is the ONLY thing that assigns a
//      branch and writes status/description; there is no separate keyword
//      pre-filter. Groq always returns a branch pick (best guess, honestly
//      scored) rather than omitting one when unsure — every project gets a
//      real, reviewable suggestion instead of silently getting none. All of
//      this is written as pending AIDecision rows; nothing here touches the
//      Project table, and a human can accept, reject, or override any of it
//      at any time via /api/discover/apply.
//   If Groq is unconfigured or the call fails, we skip step 3 entirely —
//   Discover still completes using only the match results from 1-2, with no
//   branch or field suggestions.
export async function reconcile(
  items: DiscoveredItem[],
  domainNames: string[],
): Promise<ReconciliationResult> {
  const matches: MatchSuggestion[] = [];
  const domainSuggestions: DomainSuggestion[] = [];
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

  // Step 1.5: an exact-match group only forms from identically-named items
  // (e.g. two sources both literally named "taste"). A third source with a
  // near-identical but not identical name (e.g. GitHub's "taste-app") would
  // otherwise sit in the leftover pool with no exact-match partner left to
  // fuzzy-pair against (its "taste" siblings were already consumed above) —
  // and would wrongly end up standalone, creating a second, duplicate
  // project. Absorb it into the existing group instead whenever it's a
  // strong enough fuzzy match for that group's name.
  const stillRemaining: DiscoveredItem[] = [];
  for (const item of remainingAfterExact) {
    const targetMatch = matches.find(
      (m) =>
        nameSimilarity(item.name, m.suggestedName) >= FUZZY_MATCH_THRESHOLD,
    );
    if (targetMatch) {
      targetMatch.itemIds.push(item.id);
      exactMatched.add(item.id);
    } else {
      stillRemaining.push(item);
    }
  }

  // Step 2: fuzzy name match on whatever's left
  const { groups: fuzzyGroups, ungrouped: afterFuzzy } = fuzzyGroup(
    stillRemaining.map((i) => ({ id: i.id, name: i.name })),
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

  if (!isAIConfigured()) {
    const standalone = items.filter(
      (i) => !exactMatched.has(i.id) && !fuzzyMatched.has(i.id),
    );
    return {
      matches,
      standalone,
      domainSuggestions,
      fieldSuggestions,
      aiUsed: false,
      aiError: "GROQ_API_KEY not configured",
    };
  }

  // Step 3: EVERY item goes to Groq — matched (part of a group from step
  // 1/2) or standalone, it doesn't matter. Groq is the only thing that
  // decides branch and writes status/description; nothing is pre-filtered
  // out by keyword rules before it gets there. Groq is still told which
  // items are already matched so it never re-litigates a settled match —
  // it just skips the matching question for those and goes straight to
  // branch + field suggestions.
  //
  // Batched into fixed-size chunks so a single call's JSON output (match +
  // branch + field verdicts for every item) stays bounded regardless of
  // total registry size -- an unbatched call over ~140 items previously
  // exceeded max_tokens and got silently truncated (finish_reason: length),
  // causing the whole run to fall back to deterministic-only matching.
  //
  // FIX (2nd pass): the actual bug wasn't batch size -- it was that
  // callGroqJSON always reserved a flat max_tokens: 16000 against the TPM
  // quota on every call regardless of batch size, since Groq counts
  // max_tokens as RESERVED, not just what's actually generated. A real run
  // showed a single 8-item batch requesting 16,948 tokens (16,000 reserved
  // + ~950 prompt) against a 12,000 TPM limit -- failing on the very first
  // call no matter how small the batch was. That's fixed in ai.ts now
  // (max_tokens is sized per-batch below). Batch size stays small (8) so
  // the PROMPT side also stays cheap, and the per-minute delay is computed
  // from the real max_tokens this batch will request, not a guess.
  const GROQ_BATCH_SIZE = Number(process.env.GROQ_BATCH_SIZE) || 8;
  const batches: DiscoveredItem[][] = [];
  for (let i = 0; i < items.length; i += GROQ_BATCH_SIZE) {
    batches.push(items.slice(i, i + GROQ_BATCH_SIZE));
  }

  const alreadyMatchedIds = new Set(
    items
      .map((i) => i.id)
      .filter((id) => exactMatched.has(id) || fuzzyMatched.has(id)),
  );

  // completion max_tokens per batch: ~150 tokens of JSON output per item
  // (match+domain+field verdict) plus a fixed buffer for prompt overhead
  // headroom -- deliberately generous per-item but NOT a flat 16000 no
  // matter the batch size, since that reserved amount is what blew the
  // quota. Env-overridable since real usage may need tuning per prompt size.
  const TOKENS_PER_ITEM_COMPLETION =
    Number(process.env.GROQ_TOKENS_PER_ITEM_OUT) || 150;
  const maxTokensForBatch = GROQ_BATCH_SIZE * TOKENS_PER_ITEM_COMPLETION + 500;

  // Serialized, not parallel, AND paced against the real per-minute budget.
  // TPM accounting = prompt tokens (actual, ~150/item measured) + reserved
  // max_tokens (the completion budget above) -- both count against quota.
  const TPM_LIMIT = Number(process.env.GROQ_TPM_LIMIT) || 12000;
  const TOKENS_PER_ITEM_PROMPT =
    Number(process.env.GROQ_TOKENS_PER_ITEM_IN) || 150;
  const promptTokensForBatch = GROQ_BATCH_SIZE * TOKENS_PER_ITEM_PROMPT + 300; // +300 system prompt overhead
  const tokensPerBatch = promptTokensForBatch + maxTokensForBatch;
  const batchesPerWindow = Math.max(1, Math.floor(TPM_LIMIT / tokensPerBatch));
  const delayMs = Math.ceil(60_000 / batchesPerWindow) + 500; // +500ms safety margin

  const batchResults: Awaited<ReturnType<typeof callGrokReconcile>>[] = [];
  for (const batch of batches) {
    const result = await callGrokReconcile(
      batch,
      domainNames,
      alreadyMatchedIds,
      maxTokensForBatch,
    );
    batchResults.push(result);
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // A single bad/oversized batch shouldn't sink the whole run -- items in a
  // failed batch just fall through to standalone (still fully usable,
  // reviewable, and re-triable on the next Discover click), while every
  // other batch's real AI results still get applied.
  const anySucceeded = batchResults.some((r) => r.ok);
  const failedBatchCount = batchResults.filter((r) => !r.ok).length;
  if (!anySucceeded) {
    const standalone = items.filter(
      (i) => !exactMatched.has(i.id) && !fuzzyMatched.has(i.id),
    );
    return {
      matches,
      standalone,
      domainSuggestions,
      fieldSuggestions,
      aiUsed: false,
      aiError:
        batchResults.find((r) => !r.ok)?.error ?? "All Groq batches failed",
    };
  }

  const aiResult: {
    matches: MatchSuggestion[];
    domainSuggestions: DomainSuggestion[];
    fieldSuggestions: FieldSuggestion[];
  } = {
    matches: [],
    domainSuggestions: [],
    fieldSuggestions: [],
  };
  for (const r of batchResults) {
    if (r.ok) {
      aiResult.matches.push(...r.matches);
      aiResult.domainSuggestions.push(...r.domainSuggestions);
      aiResult.fieldSuggestions.push(...r.fieldSuggestions);
    }
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
  domainSuggestions.push(...aiResult.domainSuggestions);
  fieldSuggestions.push(...aiResult.fieldSuggestions);

  const standalone = items.filter(
    (i) => !exactMatched.has(i.id) && !fuzzyMatched.has(i.id),
  );

  return {
    matches,
    standalone,
    domainSuggestions,
    fieldSuggestions,
    aiUsed: true,
    aiError:
      failedBatchCount > 0
        ? `${failedBatchCount} of ${batches.length} AI batch(es) failed and fell back to name-matching only for those items: ${batchResults.find((r) => !r.ok)?.error ?? ""}`
        : undefined,
  };
}

interface GroqReconcileOutput {
  matches: MatchSuggestion[];
  domainSuggestions: DomainSuggestion[];
  fieldSuggestions: FieldSuggestion[];
}

async function callGrokReconcile(
  items: DiscoveredItem[],
  domainNames: string[],
  alreadyMatchedIds: Set<string>,
  maxTokens: number,
): Promise<
  ({ ok: true } & GroqReconcileOutput) | { ok: false; error: string }
> {
  const systemPrompt = `You reconcile project data discovered across Vercel, GitHub, and Supabase for a small company's internal dashboard. You will be given a JSON array of items with an index-based id. Some items are marked "alreadyMatched": true — these have ALREADY been grouped with another item by a separate, more reliable name-matching step. Do NOT propose a match for them and do NOT include them in the "matches" array under any circumstances, even if you think you see a better grouping — that decision is final and out of scope here. You may still suggest a domain or fill in missing fields for them.

Respond with ONLY a raw JSON object, no markdown, no commentary, matching exactly this shape:
{
  "matches": [{ "itemIds": ["<id>", "<id>"], "suggestedName": "string", "confidence": 0.0-1.0, "reasoning": "short reason" }],
  "domainSuggestions": [{ "itemId": "<id>", "suggestedDomainName": "<one of the domain names given below>", "confidence": 0.0-1.0, "reasoning": "short reason" }],
  "fieldSuggestions": [{ "itemId": "<id>", "suggestedStatus": "live | broken | in_development | archived | demo_only", "suggestedDescription": "one short sentence describing what the project actually is/does", "confidence": 0.0-1.0, "reasoning": "short reason" }]
}
Available domains (suggest ONLY from this exact list — never invent a domain name): ${domainNames.join(", ") || "(none configured yet)"}

CRITICAL DISTINCTION — read carefully, these are two completely different questions:
- "matches" answers: are these items THE SAME real-world project, just discovered on different platforms (e.g. one repo + one Vercel deployment that are the same app)?
- "domainSuggestions" answers: which business/branch does this project belong to?
A project's DESCRIPTION, README content, or language tells you what business it belongs to (domain) — it does NOT tell you its identity. Two DIFFERENT, UNRELATED projects that both belong to the same domain will naturally mention that domain's name in their description (e.g. a clinic site and a restaurant app both built for "KDH" will both say "KDH" somewhere) — that is normal and expected, and is a domainSuggestion signal ONLY. NEVER put two items in the same "matches" group because their descriptions both mention the same domain, client, or company name. Matching requires evidence the items are literally the same product: identical or near-identical NAME, or unmistakably identical PURPOSE described in near-identical terms (not just a shared keyword). "Both mention KDH" or "both are AI-related" is NEVER sufficient grounds for a match — it is, at most, weak grounds for a domainSuggestion.

Rules:
- NEVER include an "alreadyMatched": true item's id in the "matches" array, alone or grouped — see instruction above.
- Only include a NEW match group (for items not already matched) if you are reasonably confident (>0.7) the items are the SAME real-world project across different sources, per the CRITICAL DISTINCTION above. Do not merge items just because they share a generic word, a domain/company name, or a topic area. When genuinely unsure whether two items are the same project or just two different projects in the same domain, do NOT propose a match — leave them as separate standalone items and rely on domainSuggestions to group them by business area instead.
- For fieldSuggestions: give your best real guess at status and a one-sentence description for EVERY item that's missing one, using its name/description/language/source as context. A short educated guess, honestly scored, is more useful than omitting it.
- For domainSuggestions: give a domain pick for EVERY item, even the ones already matched or without an obvious signal — pick the closest fit from the available domains based on whatever name/description/language you have, and be honest in the confidence score when it's a weak guess. This IS the right place to use description/company-name mentions as a signal.
- confidence reflects your actual certainty, not a fixed number — a forced guess with little signal should score low (e.g. 0.2-0.4), a strong signal should score high (0.8+).
- Every decision here is applied automatically and immediately, with no human review step before it's saved. There is no safety net for a wrong guess, so a genuinely uncertain match should be OMITTED rather than included at low confidence — the cost of a false merge (combining two real, different projects into one) is much higher than the cost of leaving two related-but-distinct items unmerged for a human to notice and fix later via the registry UI.`;

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

  const result = await callGroqJSON(systemPrompt, userPrompt, maxTokens);
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

  const domainSuggestions = (parsed.domainSuggestions ?? [])
    .filter(
      (b) =>
        validItemIds.has(b.itemId) &&
        domainNames.includes(b.suggestedDomainName),
    )
    .map((b) => ({ ...b, method: "ai" as const }));

  const fieldSuggestions = (parsed.fieldSuggestions ?? [])
    .filter((f) => validItemIds.has(f.itemId))
    .map((f) => ({ ...f, method: "ai" as const }));

  return { ok: true, matches, domainSuggestions, fieldSuggestions };
}

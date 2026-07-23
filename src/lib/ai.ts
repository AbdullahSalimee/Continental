// Thin client for Groq (console.groq.com) — OpenAI-compatible /chat/completions
// endpoint, genuine free tier (no billing required to start). Used ONLY to
// generate suggestions for the Discover flow. Nothing in this file writes
// to the database; callers are responsible for treating the output as a
// proposal (see AIDecision model + /api/discover route).

const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface AICallResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

// Calls Groq with a system + user prompt, expecting a raw JSON string back.
// Times out fast (10s) so a slow/down provider can't hang the whole Discover
// request — callers should catch failures and fall back to fuzzy-only.
export async function callGroqJSON(
  systemPrompt: string,
  userPrompt: string,
): Promise<AICallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GROQ_API_KEY not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(GROQ_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0, // deterministic-as-possible; we still cache by input hash on top of this
        max_tokens: 8000, // raised from 2000: every discovered item now goes
        // through this call (match + branch + field verdicts), not just a
        // small leftover subset, so the JSON response is much larger — 2000
        // was silently truncating fieldSuggestions (last key in the schema)
        // on runs with ~40+ items.
        response_format: { type: "json_object" }, // Groq/OpenAI-style forced JSON output
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Groq API responded ${res.status}: ${body.slice(0, 300)}`,
      };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason;
    if (typeof text !== "string") {
      return { ok: false, error: "Groq response missing message content" };
    }
    if (finishReason === "length") {
      return {
        ok: false,
        error:
          "Groq response was cut off by max_tokens before finishing (finish_reason: length) — increase max_tokens or send fewer items per call.",
      };
    }

    return { ok: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Groq call failed: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

// Strips markdown code fences etc. in case the model wraps its JSON reply.
export function extractJSON<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json\s*|```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to find the first [...] or {...} block as a last resort.
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

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
// Timeout is generous (90s) because real completions for reconciliation
// batches routinely take 20-40s+ -- this used to be 10s, which meant nearly
// every AI call was aborted before Groq finished, silently falling back to
// fuzzy-only matching on every run. Discover runs as a cron job / background
// trigger, not in the hot path of a user click, so there's no UX reason to
// cut this short. If Groq is genuinely down, 90s still bounds the wait.
export async function callGroqJSON(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4000,
): Promise<AICallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GROQ_API_KEY not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

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
        // FIX: this used to be a flat 16000 regardless of batch size. Groq's
        // TPM limit counts max_tokens as RESERVED against the quota even
        // when the actual completion is much shorter -- an 8-item batch
        // whose real output needed ~1,000 tokens was still reserving 16,000
        // against a 12,000/minute budget and got a 413 on the very first
        // call, no matter how small the batch actually was. Caller now
        // sizes this to the batch it's sending.
        max_tokens: maxTokens,
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

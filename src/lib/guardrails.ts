// Lightweight, deterministic guardrails that run before the model is called.
// They are intentionally simple and transparent; the system prompt adds a
// second layer, and retrieved filing text is always treated as data.

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i,
  /disregard (all |any |the )?(previous|prior|above|system) (instructions|prompts?|rules)/i,
  /(reveal|show|print|repeat|output) (me )?(your|the) (system prompt|hidden instructions|instructions)/i,
  /you are no longer|from now on you (are|will)|act as (?!an? (analyst|investor))/i,
  /\b(jailbreak|DAN mode|developer mode)\b/i,
  /<\/?(system|assistant)>/i,
];

const ADVICE_PATTERNS: RegExp[] = [
  /\bshould i (buy|sell|short|invest|hold)\b/i,
  /\b(buy|sell) (or (sell|buy|hold) )?(the )?(stock|shares)\b/i,
  /\b(price target|will the stock (go up|rise|fall|drop))\b/i,
];

export type GuardrailResult = { blocked: false } | { blocked: true; reason: "prompt_injection"; message: string };

export function checkInput(text: string): GuardrailResult {
  if (INJECTION_PATTERNS.some((p) => p.test(text))) {
    return {
      blocked: true,
      reason: "prompt_injection",
      message:
        "I can't follow instructions that try to change how I work. Ask me a question about the SEC filings in my index, for example: \"What are Apple's main supply chain risks?\"",
    };
  }
  return { blocked: false };
}

/** Investment-advice questions are answered, but with facts only and a disclaimer. */
export function isAdviceRequest(text: string): boolean {
  return ADVICE_PATTERNS.some((p) => p.test(text));
}

export const MAX_INPUT_CHARS = 2000;

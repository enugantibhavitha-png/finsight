// Central configuration. Values can be overridden with environment variables.
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
// Model used as the judge in the faithfulness eval. A stronger model (e.g. gpt-4o) is a stricter judge.
export const JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL ?? "gpt-4o-mini";
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

// Smaller vectors keep the index file small enough to ship with the app.
export const EMBEDDING_DIMENSIONS = 512;

export const CHUNK_SIZE = 1200; // characters
export const CHUNK_OVERLAP = 200; // characters
export const DEFAULT_TOP_K = 6;
export const MAX_AGENT_STEPS = 5;

// USD per 1M tokens, used only for the cost estimate shown in the UI.
// Update these if you change models or prices change.
export const PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

import { PRICING_PER_MILLION } from "./config";

export type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number | null;
};

export function summarizeUsage(
  model: string,
  usage: { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number } },
): UsageSummary {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const price = PRICING_PER_MILLION[model];
  const estimatedCostUsd = price
    ? Number(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(6))
    : null;
  return { inputTokens, outputTokens, cachedInputTokens, estimatedCostUsd };
}

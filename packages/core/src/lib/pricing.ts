// Adapted from cc-lens (Arindam200/cc-lens, MIT) — https://github.com/Arindam200/cc-lens
// Original file: `lib/pricing.ts`. The pricing constants and formulas are a
// verbatim port; shapes have been widened to the canonical
// `@control-plane/core` `TurnUsage` / `ModelUsage` / `ModelPricing` /
// `CacheEfficiency` types so any adapter can use them.
//
// MIT License (see cc-lens repository for the full text). Changes from the
// original: typed inputs, explicit return type on `estimateCostFromUsage`,
// `cacheEfficiency` returns camelCase fields matching `CacheEfficiency`.
import type { CacheEfficiency, ModelPricing, ModelUsage, TurnUsage } from "../domain/costs.js";

/**
 * Canonical pricing table. Prices are USD *per token* (i.e. per-million
 * values from Anthropic's public rate card divided by 1_000_000).
 *
 * Adding a new model is a type-safe addition — the structural type makes it
 * an error to miss any of the four dimensions.
 */
export const PRICING: Readonly<Record<string, ModelPricing>> = {
  "claude-opus-4-7": {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
    cacheWrite: 18.75 / 1_000_000,
    cacheRead: 1.5 / 1_000_000,
  },
  "claude-opus-4-6": {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
    cacheWrite: 18.75 / 1_000_000,
    cacheRead: 1.5 / 1_000_000,
  },
  "claude-opus-4-5-20251101": {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
    cacheWrite: 18.75 / 1_000_000,
    cacheRead: 1.5 / 1_000_000,
  },
  "claude-sonnet-4-6": {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
    cacheWrite: 3.75 / 1_000_000,
    cacheRead: 0.3 / 1_000_000,
  },
  "claude-haiku-4-5": {
    input: 0.8 / 1_000_000,
    output: 4.0 / 1_000_000,
    cacheWrite: 1.0 / 1_000_000,
    cacheRead: 0.08 / 1_000_000,
  },
};

/** Stable fallback used when a model name doesn't resolve. Documented so
 *  callers know the cost for an unknown model is an *upper bound*, not zero. */
export const PRICING_FALLBACK_KEY = "claude-opus-4-6" as const;

/**
 * Resolves a model name to its pricing row. Exact match first; otherwise a
 * prefix match (either direction, to match cc-lens behavior); otherwise the
 * canonical fallback. Never throws.
 */
export function getPricing(model: string): ModelPricing {
  const exact = PRICING[model];
  if (exact) return exact;
  const firstThree = model.split("-").slice(0, 3).join("-");
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key) || key.startsWith(firstThree)) {
      return PRICING[key]!;
    }
  }
  return PRICING[PRICING_FALLBACK_KEY]!;
}

/**
 * Cost of a single assistant turn, USD. Missing usage fields contribute zero.
 * Ported verbatim from cc-lens `lib/pricing.ts::estimateCostFromUsage`.
 */
export function estimateCostFromUsage(model: string, usage: TurnUsage): number {
  const p = getPricing(model);
  return (
    (usage.inputTokens ?? 0) * p.input +
    (usage.outputTokens ?? 0) * p.output +
    (usage.cacheCreationInputTokens ?? 0) * p.cacheWrite +
    (usage.cacheReadInputTokens ?? 0) * p.cacheRead
  );
}

/** Aggregated-usage cost (ModelUsage → USD). Mirrors cc-lens
 *  `estimateTotalCostFromModel`. */
export function estimateCostFromModelUsage(model: string, usage: ModelUsage): number {
  const p = getPricing(model);
  return (
    usage.inputTokens * p.input +
    usage.outputTokens * p.output +
    usage.cacheCreationInputTokens * p.cacheWrite +
    usage.cacheReadInputTokens * p.cacheRead
  );
}

/**
 * Cache-hit economics. `savedUsd` is the difference between the cache-read
 * tokens at input prices vs at cache-read prices. `hitRate` is cache-read
 * tokens ÷ (inputTokens + cache-read tokens).
 * Ported from cc-lens `lib/pricing.ts::cacheEfficiency`.
 */
export function cacheEfficiency(model: string, usage: ModelUsage): CacheEfficiency {
  const p = getPricing(model);
  const savedPerToken = p.input - p.cacheRead;
  const savedUsd = usage.cacheReadInputTokens * savedPerToken;
  const totalContext = usage.inputTokens + usage.cacheReadInputTokens;
  const hitRate = totalContext > 0 ? usage.cacheReadInputTokens / totalContext : 0;
  const wouldHavePaidUsd =
    (usage.inputTokens + usage.cacheReadInputTokens) * p.input +
    usage.outputTokens * p.output +
    usage.cacheCreationInputTokens * p.cacheWrite;
  return { savedUsd, hitRate, wouldHavePaidUsd };
}

/** Convenience: zero-valued `CacheEfficiency` for sessions with no usage. */
export const EMPTY_CACHE_EFFICIENCY: CacheEfficiency = {
  savedUsd: 0,
  hitRate: 0,
  wouldHavePaidUsd: 0,
};

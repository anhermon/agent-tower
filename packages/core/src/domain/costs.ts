import type { JsonObject, MetadataCarrier } from "./common.js";

export type CurrencyCode = "USD" | "EUR" | "GBP" | "ILS" | (string & {});

export const PRICING_UNITS = {
  InputToken: "input_token",
  OutputToken: "output_token",
  ToolCall: "tool_call",
  SessionMinute: "session_minute",
  Request: "request"
} as const;

export type PricingUnit = (typeof PRICING_UNITS)[keyof typeof PRICING_UNITS];

export interface UsageMetric {
  readonly unit: PricingUnit;
  readonly quantity: number;
}

export interface CostLineItem extends MetadataCarrier {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceType: "session" | "tool_call" | "mcp" | "channel" | "runtime";
  readonly description: string;
  readonly usage: UsageMetric;
  readonly unitPrice: Money;
  readonly total: Money;
}

export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

export interface PricingRule {
  readonly id: string;
  readonly runtime?: string;
  readonly model?: string;
  readonly unit: PricingUnit;
  readonly unitPrice: Money;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly metadata?: JsonObject;
}

export interface CostEstimate {
  readonly id: string;
  readonly createdAt: string;
  readonly currency: CurrencyCode;
  readonly lineItems: readonly CostLineItem[];
  readonly total: Money;
}

// ─── Phase 1 Wave 0: sessions-superset additions ──────────────────────────────
// Canonical, adapter-agnostic extensions used by the analytics layer. All
// fields are optional at the consuming-entity level; these types themselves
// have required fields to keep the math honest.

/**
 * Unit-priced view of a single model. Prices are USD *per token*.
 */
export interface ModelPricing {
  readonly input: number;
  readonly output: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
}

/**
 * Token usage reported on a single assistant turn. Matches the shape the
 * Claude Code JSONL transcripts emit on `assistant.message.usage`. All token
 * counts are nullable in the wire format; downstream code treats missing
 * values as zero.
 */
export interface TurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly ephemeral5mInputTokens?: number;
  readonly ephemeral1hInputTokens?: number;
  readonly serviceTier?: string;
  readonly inferenceGeo?: string;
}

/**
 * Aggregated model usage across one or more turns / sessions / projects.
 */
export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
}

/**
 * Result of comparing actual cache-fed cost against the cost that would have
 * been paid without any cache hits. All fields are USD totals (not per token).
 */
export interface CacheEfficiency {
  readonly savedUsd: number;
  readonly hitRate: number; // 0..1
  readonly wouldHavePaidUsd: number;
}

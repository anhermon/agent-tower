import { describe, expect, it } from "vitest";
import type { ModelUsage, TurnUsage } from "../domain/costs.js";
import {
  cacheEfficiency,
  EMPTY_CACHE_EFFICIENCY,
  estimateCostFromModelUsage,
  estimateCostFromUsage,
  getPricing,
  PRICING,
  PRICING_FALLBACK_KEY,
} from "./pricing.js";

describe("pricing", () => {
  it("given_every_known_model__when_snapshotting_prices__then_rates_match_the_public_rate_card_divided_per_token", () => {
    // Per-token view of the public rate card. Deliberately duplicated here so
    // that a typo in `pricing.ts` produces a loud snapshot diff.
    expect(PRICING).toEqual({
      "claude-opus-4-7": {
        input: 15 / 1_000_000,
        output: 75 / 1_000_000,
        cacheWrite: 18.75 / 1_000_000,
        cacheRead: 1.5 / 1_000_000,
      },
      "claude-opus-4-6": {
        input: 15 / 1_000_000,
        output: 75 / 1_000_000,
        cacheWrite: 18.75 / 1_000_000,
        cacheRead: 1.5 / 1_000_000,
      },
      "claude-opus-4-5-20251101": {
        input: 15 / 1_000_000,
        output: 75 / 1_000_000,
        cacheWrite: 18.75 / 1_000_000,
        cacheRead: 1.5 / 1_000_000,
      },
      "claude-sonnet-4-6": {
        input: 3 / 1_000_000,
        output: 15 / 1_000_000,
        cacheWrite: 3.75 / 1_000_000,
        cacheRead: 0.3 / 1_000_000,
      },
      "claude-haiku-4-5": {
        input: 0.8 / 1_000_000,
        output: 4 / 1_000_000,
        cacheWrite: 1 / 1_000_000,
        cacheRead: 0.08 / 1_000_000,
      },
    });
  });

  it("given_an_exact_model_name__when_looking_up_pricing__then_the_row_is_returned", () => {
    expect(getPricing("claude-sonnet-4-6")).toBe(PRICING["claude-sonnet-4-6"]);
  });

  it("given_a_dated_variant__when_looking_up_pricing__then_prefix_match_returns_the_base_row", () => {
    // cc-lens parity: `claude-sonnet-4-6-20251101` should resolve against
    // `claude-sonnet-4-6` via prefix match.
    const dated = "claude-sonnet-4-6-20251101";
    expect(getPricing(dated)).toBe(PRICING["claude-sonnet-4-6"]);
  });

  it("given_an_unknown_model__when_looking_up_pricing__then_it_falls_back_to_opus_as_upper_bound", () => {
    expect(getPricing("future-model-9000")).toBe(PRICING[PRICING_FALLBACK_KEY]);
  });

  it("given_a_sonnet_turn_usage__when_estimating_cost__then_matches_hand_computed_value", () => {
    const usage: TurnUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationInputTokens: 2000,
      cacheReadInputTokens: 10_000,
    };
    const expected =
      1000 * (3 / 1_000_000) +
      500 * (15 / 1_000_000) +
      2000 * (3.75 / 1_000_000) +
      10_000 * (0.3 / 1_000_000);
    expect(estimateCostFromUsage("claude-sonnet-4-6", usage)).toBeCloseTo(expected, 10);
  });

  it("given_a_roundtrip_of_turn_and_model_usage__when_costs_are_equal__then_aggregation_is_consistent", () => {
    const usage: TurnUsage = {
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationInputTokens: 300,
      cacheReadInputTokens: 400,
    };
    const modelUsage: ModelUsage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
    };
    const t = estimateCostFromUsage("claude-opus-4-6", usage);
    const m = estimateCostFromModelUsage("claude-opus-4-6", modelUsage);
    expect(t).toBeCloseTo(m, 12);
  });

  it("given_cache_heavy_usage__when_computing_cache_efficiency__then_fields_match_the_formula", () => {
    const usage: ModelUsage = {
      inputTokens: 1_000,
      outputTokens: 500,
      cacheCreationInputTokens: 2_000,
      cacheReadInputTokens: 8_000,
    };
    const p = PRICING["claude-opus-4-6"]!;
    const eff = cacheEfficiency("claude-opus-4-6", usage);
    expect(eff.savedUsd).toBeCloseTo(8_000 * (p.input - p.cacheRead), 10);
    expect(eff.hitRate).toBeCloseTo(8_000 / 9_000, 10);
    expect(eff.wouldHavePaidUsd).toBeCloseTo(
      (1_000 + 8_000) * p.input + 500 * p.output + 2_000 * p.cacheWrite,
      10
    );
  });

  it("given_all_zero_usage__when_computing_cache_efficiency__then_fields_are_zero_and_no_nan_is_produced", () => {
    const usage: ModelUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    const eff = cacheEfficiency("claude-sonnet-4-6", usage);
    expect(eff.savedUsd).toBe(0);
    expect(eff.hitRate).toBe(0);
    expect(eff.wouldHavePaidUsd).toBe(0);
  });

  it("given_the_empty_efficiency_export__when_comparing__then_all_fields_are_zero", () => {
    expect(EMPTY_CACHE_EFFICIENCY).toEqual({
      savedUsd: 0,
      hitRate: 0,
      wouldHavePaidUsd: 0,
    });
  });
});

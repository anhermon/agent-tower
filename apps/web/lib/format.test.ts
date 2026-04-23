import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatCost,
  formatDuration,
  formatPercent,
  formatRelative,
  formatTokens,
  truncateMiddle,
} from "./format";

describe("format (pre-existing helpers)", () => {
  it("formatBytes_returns_em_dash_for_NaN", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
  });
  it("formatRelative_returns_em_dash_for_invalid_iso", () => {
    expect(formatRelative("not-a-date")).toBe("—");
  });
  it("truncateMiddle_leaves_short_strings_untouched", () => {
    expect(truncateMiddle("abc", 16)).toBe("abc");
  });
});

describe("formatTokens", () => {
  it("given_zero__then_returns_a_plain_zero", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("given_values_under_1000__then_renders_integer_without_suffix", () => {
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(999)).toBe("999");
  });

  it("given_thousand_range__then_renders_k_with_one_decimal", () => {
    expect(formatTokens(1_000)).toBe("1.0k");
    expect(formatTokens(1_234)).toBe("1.2k");
    expect(formatTokens(999_999)).toBe("1000.0k");
  });

  it("given_million_range__then_renders_M_with_one_decimal", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(3_400_000)).toBe("3.4M");
  });

  it("given_billion_range__then_renders_B_with_one_decimal", () => {
    expect(formatTokens(2_500_000_000)).toBe("2.5B");
  });

  it("given_negative_input__then_preserves_sign", () => {
    expect(formatTokens(-1_234)).toBe("-1.2k");
    expect(formatTokens(-42)).toBe("-42");
  });

  it("given_NaN__or_Infinity__then_returns_em_dash", () => {
    expect(formatTokens(Number.NaN)).toBe("—");
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatTokens(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("given_fractional_input__then_truncates_below_the_k_threshold", () => {
    expect(formatTokens(0.5)).toBe("0");
    expect(formatTokens(12.9)).toBe("12");
  });
});

describe("formatCost", () => {
  it("given_zero__then_returns_dollar_zero_with_two_decimals", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("given_sub_cent__then_uses_four_decimal_precision", () => {
    expect(formatCost(0.0041)).toBe("$0.0041");
    expect(formatCost(0.0001)).toBe("$0.0001");
    expect(formatCost(0.0099)).toBe("$0.0099");
  });

  it("given_cents_to_dollars__then_uses_two_decimal_precision", () => {
    expect(formatCost(0.01)).toBe("$0.01");
    expect(formatCost(0.42)).toBe("$0.42");
    expect(formatCost(12.34)).toBe("$12.34");
    expect(formatCost(999.99)).toBe("$999.99");
  });

  it("given_thousand_range__then_uses_k_suffix", () => {
    expect(formatCost(1_000)).toBe("$1.0k");
    expect(formatCost(1_234)).toBe("$1.2k");
  });

  it("given_million_range__then_uses_M_suffix", () => {
    expect(formatCost(2_500_000)).toBe("$2.5M");
  });

  it("given_negative_cost__then_preserves_sign", () => {
    expect(formatCost(-12.34)).toBe("-$12.34");
    expect(formatCost(-0.005)).toBe("-$0.0050");
  });

  it("given_NaN__or_Infinity__then_returns_em_dash", () => {
    expect(formatCost(Number.NaN)).toBe("—");
    expect(formatCost(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("roundtrips_sample_fixtures", () => {
    const fixtures: [number, string][] = [
      [0, "$0.00"],
      [0.0041, "$0.0041"],
      [12.34, "$12.34"],
      [1234, "$1.2k"],
    ];
    for (const [input, expected] of fixtures) {
      expect(formatCost(input)).toBe(expected);
    }
  });
});

describe("formatDuration", () => {
  it("given_zero__then_returns_zero_seconds", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("given_sub_second_ms__then_collapses_to_zero_seconds", () => {
    expect(formatDuration(250)).toBe("0s");
    expect(formatDuration(999)).toBe("0s");
  });

  it("given_seconds_only__then_renders_just_seconds", () => {
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(59_000)).toBe("59s");
  });

  it("given_minutes_range__then_renders_m_then_padded_seconds", () => {
    expect(formatDuration(60_000)).toBe("1m 00s");
    expect(formatDuration(194_000)).toBe("3m 14s");
    expect(formatDuration(3_599_000)).toBe("59m 59s");
  });

  it("given_hours_range__then_renders_h_then_padded_minutes", () => {
    expect(formatDuration(3_600_000)).toBe("1h 00m");
    expect(formatDuration(3_720_000)).toBe("1h 02m");
    expect(formatDuration(36_000_000)).toBe("10h 00m");
  });

  it("given_negative_ms__then_treated_as_zero", () => {
    expect(formatDuration(-5_000)).toBe("0s");
  });

  it("given_NaN__or_Infinity__then_returns_em_dash", () => {
    expect(formatDuration(Number.NaN)).toBe("—");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("given_zero__then_returns_zero_percent_with_one_decimal", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("given_one__then_returns_100_percent", () => {
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("given_fractional_ratio__then_renders_one_decimal_place", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(0.001)).toBe("0.1%");
    expect(formatPercent(0.5)).toBe("50.0%");
  });

  it("given_ratio_above_one__then_still_renders_the_computed_percent", () => {
    expect(formatPercent(1.5)).toBe("150.0%");
  });

  it("given_negative_ratio__then_keeps_sign", () => {
    expect(formatPercent(-0.2)).toBe("-20.0%");
  });

  it("given_NaN__or_Infinity__then_returns_em_dash", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatPercent(Number.NEGATIVE_INFINITY)).toBe("—");
  });
});

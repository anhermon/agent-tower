import { describe, expect, it } from "vitest";

import { formatDelta, formatPercent, outcomeColor } from "./format-efficacy";

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------

describe("formatPercent", () => {
  it("given_zero__then_returns_0_percent_with_one_decimal", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("given_one__then_returns_100_percent", () => {
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("given_fractional_ratio__then_renders_one_decimal_place", () => {
    expect(formatPercent(0.1)).toBe("10.0%");
    expect(formatPercent(0.5)).toBe("50.0%");
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(0.001)).toBe("0.1%");
  });

  it("given_ratio_above_one__then_still_renders_the_computed_percent", () => {
    expect(formatPercent(1.5)).toBe("150.0%");
  });

  it("given_negative_ratio__then_keeps_sign", () => {
    expect(formatPercent(-0.2)).toBe("-20.0%");
  });

  it("given_NaN_or_Infinity__then_returns_em_dash", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatPercent(Number.NEGATIVE_INFINITY)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// formatDelta
// ---------------------------------------------------------------------------

describe("formatDelta", () => {
  it("given_zero__then_returns_zero_pp", () => {
    expect(formatDelta(0)).toBe("0.0 pp");
  });

  it("given_positive_delta__then_includes_plus_prefix", () => {
    expect(formatDelta(0.043)).toBe("+4.3 pp");
    expect(formatDelta(0.1)).toBe("+10.0 pp");
  });

  it("given_negative_delta__then_uses_unicode_minus_sign", () => {
    // U+2212 MINUS SIGN, not ASCII hyphen-minus
    expect(formatDelta(-0.021)).toBe("−2.1 pp");
    expect(formatDelta(-0.1)).toBe("−10.0 pp");
  });

  it("given_tiny_absolute_value__then_rounds_to_one_decimal", () => {
    expect(formatDelta(0.0001)).toBe("+0.0 pp");
    expect(formatDelta(-0.0001)).toBe("−0.0 pp");
  });

  it("given_NaN_or_Infinity__then_returns_em_dash", () => {
    expect(formatDelta(Number.NaN)).toBe("—");
    expect(formatDelta(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatDelta(Number.NEGATIVE_INFINITY)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// outcomeColor
// ---------------------------------------------------------------------------

describe("outcomeColor", () => {
  it("given_completed__then_returns_ok_class", () => {
    expect(outcomeColor("completed")).toBe("bg-ok/70");
  });

  it("given_partial__then_returns_warn_class", () => {
    expect(outcomeColor("partial")).toBe("bg-warn/70");
  });

  it("given_abandoned__then_returns_danger_class", () => {
    expect(outcomeColor("abandoned")).toBe("bg-danger/70");
  });

  it("given_unknown__then_returns_muted_class", () => {
    expect(outcomeColor("unknown")).toBe("bg-muted/40");
  });
});

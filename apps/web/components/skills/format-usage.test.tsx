import { describe, expect, it } from "vitest";

import { formatBytes, formatShortDate, formatTokens, maxCount } from "./format-usage";

// ---------------------------------------------------------------------------
// formatTokens
// ---------------------------------------------------------------------------

describe("formatTokens", () => {
  it("given_zero__then_returns_0", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("given_sub_1000__then_returns_integer_without_suffix", () => {
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(999)).toBe("999");
  });

  it("given_1000_to_9999__then_renders_k_with_one_decimal", () => {
    expect(formatTokens(1_000)).toBe("1.0k");
    expect(formatTokens(1_234)).toBe("1.2k");
    expect(formatTokens(9_999)).toBe("10.0k");
  });

  it("given_10000_to_999999__then_renders_k_without_decimal", () => {
    expect(formatTokens(10_000)).toBe("10k");
    expect(formatTokens(500_000)).toBe("500k");
  });

  it("given_million_range__then_renders_M_with_one_decimal_for_sub_10M", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(3_400_000)).toBe("3.4M");
    expect(formatTokens(9_900_000)).toBe("9.9M");
  });

  it("given_10M_and_above__then_renders_M_without_decimal", () => {
    expect(formatTokens(10_000_000)).toBe("10M");
    expect(formatTokens(21_000_000)).toBe("21M");
  });

  it("given_billion_range__then_renders_B_with_one_decimal", () => {
    expect(formatTokens(1_000_000_000)).toBe("1.0B");
    expect(formatTokens(2_500_000_000)).toBe("2.5B");
  });

  it("given_NaN_or_Infinity__then_returns_em_dash", () => {
    expect(formatTokens(Number.NaN)).toBe("—");
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatTokens(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("given_negative__then_returns_em_dash", () => {
    expect(formatTokens(-1)).toBe("—");
    expect(formatTokens(-1_000)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe("formatBytes", () => {
  it("given_zero__then_returns_0_B", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("given_sub_1024__then_renders_bytes", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("given_kilobyte_range__then_renders_KB_with_one_decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("given_megabyte_range__then_renders_MB_with_one_decimal", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 3.4)).toBe("3.4 MB");
  });

  it("given_gigabyte_range__then_renders_GB_with_two_decimals", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.50 GB");
  });

  it("given_NaN_or_Infinity__then_returns_em_dash", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatBytes(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("given_negative__then_returns_em_dash", () => {
    expect(formatBytes(-1)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// formatShortDate
// ---------------------------------------------------------------------------

describe("formatShortDate", () => {
  it("given_null__then_returns_em_dash", () => {
    expect(formatShortDate(null)).toBe("—");
  });

  it("given_empty_string__then_returns_em_dash", () => {
    expect(formatShortDate("")).toBe("—");
  });

  it("given_invalid_iso__then_returns_em_dash", () => {
    expect(formatShortDate("not-a-date")).toBe("—");
    expect(formatShortDate("2024-99-99")).toBe("—");
  });

  it("given_valid_iso_datetime__then_returns_UTC_date_slice", () => {
    expect(formatShortDate("2024-03-15T10:30:00.000Z")).toBe("2024-03-15");
    expect(formatShortDate("2024-12-31T23:59:59Z")).toBe("2024-12-31");
  });

  it("given_date_only_string__then_returns_the_date_itself", () => {
    expect(formatShortDate("2024-01-01")).toBe("2024-01-01");
  });
});

// ---------------------------------------------------------------------------
// maxCount
// ---------------------------------------------------------------------------

describe("maxCount", () => {
  it("given_empty_array__then_returns_0", () => {
    expect(maxCount([])).toBe(0);
  });

  it("given_all_zeros__then_returns_0", () => {
    expect(maxCount([0, 0, 0])).toBe(0);
  });

  it("given_positive_values__then_returns_the_largest", () => {
    expect(maxCount([1, 5, 3, 2])).toBe(5);
  });

  it("given_single_element__then_returns_it", () => {
    expect(maxCount([42])).toBe(42);
  });

  it("given_negative_values__then_collapses_to_0", () => {
    expect(maxCount([-10, -5])).toBe(0);
  });

  it("given_mixed_negative_and_positive__then_returns_positive_max", () => {
    expect(maxCount([-5, 3, 7, -1])).toBe(7);
  });

  it("given_non_finite_values__then_ignores_them", () => {
    expect(maxCount([Number.NaN, 5, Number.POSITIVE_INFINITY])).toBe(5);
  });
});

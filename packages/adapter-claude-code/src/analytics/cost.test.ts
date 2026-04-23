import { estimateCostFromUsage } from "@control-plane/core";
import { claudeCodeFixture } from "@control-plane/testing/fixtures/claude-code";
import { describe, expect, it } from "vitest";
import type { ClaudeTranscriptEntry } from "../types.js";
import { foldCostBreakdown } from "./cost.js";
import { foldSessionSummary } from "./session-summary.js";

function entries(name: Parameters<typeof claudeCodeFixture>[0]): readonly ClaudeTranscriptEntry[] {
  return claudeCodeFixture(name).entries as readonly ClaudeTranscriptEntry[];
}

describe("foldCostBreakdown", () => {
  it("given_sessions_across_multiple_models__when_folding__then_per_model_costs_match_cc_lens_formulas", () => {
    // Compute expected per-model costs by hand using the same formula the
    // library uses — this guards against any drift in the fold.
    const all = [
      foldSessionSummary(entries("single-turn")), // sonnet
      foldSessionSummary(entries("multi-turn")), // opus
      foldSessionSummary(entries("web-search")), // haiku
      foldSessionSummary(entries("mcp-tool")), // sonnet
    ];
    const breakdown = foldCostBreakdown(all);
    const byModel = new Map(breakdown.byModel.map((m) => [m.model, m]));

    // Expected Sonnet cost = session1 + session4 from direct usage sum.
    const sonnetExpected =
      estimateCostFromUsage("claude-sonnet-4-6", {
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      }) +
      estimateCostFromUsage("claude-sonnet-4-6", {
        inputTokens: 80,
        outputTokens: 30,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      }) +
      estimateCostFromUsage("claude-sonnet-4-6", {
        inputTokens: 120,
        outputTokens: 15,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      });
    expect(byModel.get("claude-sonnet-4-6")?.estimatedCostUsd).toBeCloseTo(sonnetExpected, 10);
    // The total should equal the sum of the sessions' costs.
    expect(breakdown.totalUsd).toBeCloseTo(
      all.reduce((acc, s) => acc + s.estimatedCostUsd, 0),
      10
    );
  });

  it("given_a_session_with_cache_heavy_traffic__when_folding__then_cache_efficiency_is_per_model_not_blended", () => {
    const all = [foldSessionSummary(entries("multi-turn"))];
    const breakdown = foldCostBreakdown(all);
    const opus = breakdown.byModel.find((m) => m.model === "claude-opus-4-6")!;
    expect(opus.cacheEfficiency.hitRate).toBeGreaterThan(0);
    expect(opus.cacheEfficiency.savedUsd).toBeGreaterThan(0);
  });

  it("given_a_daily_breakdown__when_folding__then_dates_are_in_chronological_order", () => {
    const all = [
      foldSessionSummary(entries("single-turn")), // 2026-02-01
      foldSessionSummary(entries("multi-turn")), // 2026-02-02
      foldSessionSummary(entries("compaction")), // 2026-02-03
    ];
    const breakdown = foldCostBreakdown(all);
    expect(breakdown.daily.map((d) => d.date)).toEqual(["2026-02-01", "2026-02-02", "2026-02-03"]);
  });

  it("given_empty_sessions__when_folding__then_returns_zero_totals_with_empty_efficiency", () => {
    const breakdown = foldCostBreakdown([]);
    expect(breakdown.totalUsd).toBe(0);
    expect(breakdown.byModel).toEqual([]);
    expect(breakdown.overallCacheEfficiency).toEqual({
      savedUsd: 0,
      hitRate: 0,
      wouldHavePaidUsd: 0,
    });
  });

  it("given_a_custom_project_key__when_folding__then_rows_use_that_grouping", () => {
    const all = [foldSessionSummary(entries("single-turn"))];
    const breakdown = foldCostBreakdown(all, {
      projectKey: () => ({ id: "custom-id", displayName: "Custom Project" }),
    });
    expect(breakdown.byProject).toHaveLength(1);
    expect(breakdown.byProject[0]!.projectId).toBe("custom-id");
    expect(breakdown.byProject[0]!.displayName).toBe("Custom Project");
  });
});

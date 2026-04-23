import { claudeCodeFixture } from "@control-plane/testing/fixtures/claude-code";
import { describe, expect, it } from "vitest";
import type { ClaudeTranscriptEntry } from "../types.js";
import { foldSessionSummary } from "./session-summary.js";
import { computeStreaks, foldTimeseries } from "./timeseries.js";

function entries(name: Parameters<typeof claudeCodeFixture>[0]): readonly ClaudeTranscriptEntry[] {
  return claudeCodeFixture(name).entries as readonly ClaudeTranscriptEntry[];
}

describe("foldTimeseries", () => {
  it("given_sessions_across_multiple_days__when_folding__then_daily_bucketing_and_dow_and_hours_are_correct", () => {
    // All fixtures have distinct dates Feb 1..Feb 7 2026.
    const names = [
      "single-turn",
      "multi-turn",
      "compaction",
      "thinking",
      "mcp-tool",
      "task-agent",
      "web-search",
    ] as const;
    const summaries = names.map((n) => foldSessionSummary(entries(n)));
    const ts = foldTimeseries(summaries);

    expect(ts.daily).toHaveLength(7);
    expect(ts.daily.map((d) => d.date).sort()).toEqual([
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
      "2026-02-04",
      "2026-02-05",
      "2026-02-06",
      "2026-02-07",
    ]);
    expect(ts.range).toEqual({ from: "2026-02-01", to: "2026-02-07" });

    // All test sessions start between 09:00-15:00 UTC — peak hours for these
    // bins should be strictly positive.
    const populatedHours = ts.peakHours.filter((h) => h.messageCount > 0).map((h) => h.hour);
    expect(populatedHours.length).toBeGreaterThan(0);
    for (const h of populatedHours) {
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThanOrEqual(15);
    }

    // Day-of-week totals must sum to the number of sessions folded.
    const dowSessions = ts.dayOfWeek.reduce((acc, d) => acc + d.sessionCount, 0);
    expect(dowSessions).toBe(7);
  });

  it("given_no_sessions__when_folding__then_returns_empty_series_and_zero_streaks", () => {
    const ts = foldTimeseries([]);
    expect(ts.daily).toEqual([]);
    expect(ts.streaks.longestStreakDays).toBe(0);
    expect(ts.streaks.currentStreakDays).toBe(0);
  });
});

describe("computeStreaks", () => {
  it("given_three_contiguous_days_and_now_inside_streak__when_computed__then_returns_3_for_both_values", () => {
    const dates = new Set(["2026-02-10", "2026-02-11", "2026-02-12"]);
    expect(computeStreaks(dates, "2026-02-12")).toEqual({
      currentStreakDays: 3,
      longestStreakDays: 3,
      mostActiveDate: "2026-02-12",
      mostActiveDayMessageCount: 0,
    });
  });

  it("given_a_gap__when_computed__then_longest_run_is_returned_and_current_breaks", () => {
    const dates = new Set([
      "2026-02-10",
      "2026-02-11",
      "2026-02-12",
      // gap on the 13th
      "2026-02-14",
    ]);
    const result = computeStreaks(dates, "2026-02-14");
    expect(result.longestStreakDays).toBe(3);
    expect(result.currentStreakDays).toBe(1);
  });

  it("given_no_now__when_computed__then_current_streak_is_zero_but_longest_is_still_derived", () => {
    const dates = new Set(["2026-02-10", "2026-02-11"]);
    expect(computeStreaks(dates)).toMatchObject({
      currentStreakDays: 0,
      longestStreakDays: 2,
    });
  });
});

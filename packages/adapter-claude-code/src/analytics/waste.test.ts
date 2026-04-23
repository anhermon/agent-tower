import { describe, expect, it } from "vitest";

import type { SessionUsageSummary, SessionWasteSignals } from "@control-plane/core";

import { scoreSessionsWaste, scoreSessionWaste } from "./waste.js";

function makeSummary(
  sessionId: string,
  waste: SessionWasteSignals | undefined
): SessionUsageSummary {
  return {
    sessionId,
    model: "claude-sonnet-4-6",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
    estimatedCostUsd: 0,
    cacheEfficiency: { savedUsd: 0, hitRate: 0, wouldHavePaidUsd: 0 },
    toolCounts: {},
    flags: {
      hasCompaction: false,
      hasThinking: false,
      usesTaskAgent: false,
      usesMcp: false,
      usesWebSearch: false,
      usesWebFetch: false,
    },
    compactions: [],
    userMessageCount: 0,
    assistantMessageCount: 0,
    waste,
  };
}

function makeWaste(overrides: Partial<SessionWasteSignals>): SessionWasteSignals {
  return {
    cacheThrashRatio: 0,
    distinctToolCount: 0,
    mcpToolCallPct: 0,
    sequentialToolTurnPct: 0,
    toolFailurePct: 0,
    peakInputTokensBetweenCompactions: 0,
    bloatWithoutCompaction: false,
    repeatReads: [],
    totalToolUseBlocks: 0,
    totalToolResults: 0,
    ...overrides,
  };
}

describe("scoreSessionWaste", () => {
  it("given_a_pathological_session__when_scoring__then_overall_exceeds_half_and_flags_quote_repeat_read_path", () => {
    const summary = makeSummary(
      "session-bad",
      makeWaste({
        cacheThrashRatio: 0.5,
        sequentialToolTurnPct: 0.7,
        repeatReads: [{ filePath: "/a", count: 9 }],
        bloatWithoutCompaction: true,
        peakInputTokensBetweenCompactions: 200_000,
        totalToolUseBlocks: 40,
      })
    );

    const verdict = scoreSessionWaste(summary);

    expect(verdict.sessionId).toBe("session-bad");
    expect(verdict.overall).toBeGreaterThan(0.5);
    expect(verdict.flags.some((f) => f.includes("/a"))).toBe(true);
    // Each sub-score should stay within [0, 1].
    for (const v of Object.values(verdict.scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("given_a_clean_session__when_scoring__then_overall_is_low_and_flags_are_empty", () => {
    const summary = makeSummary(
      "session-clean",
      makeWaste({
        cacheThrashRatio: 0.1,
        distinctToolCount: 4,
        mcpToolCallPct: 0,
        sequentialToolTurnPct: 0.2,
        toolFailurePct: 0.01,
        peakInputTokensBetweenCompactions: 20_000,
        bloatWithoutCompaction: false,
        repeatReads: [],
      })
    );

    const verdict = scoreSessionWaste(summary);

    expect(verdict.overall).toBeLessThan(0.15);
    expect(verdict.flags).toEqual([]);
  });

  it("given_a_summary_without_waste_signals__when_scoring__then_returns_zero_scores_with_unavailable_flag", () => {
    const summary = makeSummary("session-no-waste", undefined);

    const verdict = scoreSessionWaste(summary);

    expect(verdict.sessionId).toBe("session-no-waste");
    expect(verdict.overall).toBe(0);
    expect(verdict.scores).toEqual({
      cacheThrash: 0,
      toolPollution: 0,
      sequentialTools: 0,
      toolHammering: 0,
      contextBloat: 0,
      compactionAbsence: 0,
    });
    expect(verdict.flags).toEqual(["waste signals unavailable"]);
  });
});

describe("scoreSessionsWaste", () => {
  it("given_a_mixed_batch__when_scoring__then_returns_one_verdict_per_input_preserving_order", () => {
    const clean = makeSummary("a", makeWaste({ cacheThrashRatio: 0.1 }));
    const missing = makeSummary("b", undefined);
    const bad = makeSummary("c", makeWaste({ cacheThrashRatio: 0.7, sequentialToolTurnPct: 0.9 }));

    const verdicts = scoreSessionsWaste([clean, missing, bad]);

    expect(verdicts.map((v) => v.sessionId)).toEqual(["a", "b", "c"]);
    expect(verdicts[1]?.flags).toEqual(["waste signals unavailable"]);
    expect(verdicts[2]!.overall).toBeGreaterThan(verdicts[0]!.overall);
  });
});

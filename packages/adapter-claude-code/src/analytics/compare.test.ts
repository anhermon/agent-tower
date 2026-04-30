import { describe, expect, it } from "vitest";

import type { SessionUsageSummary } from "@control-plane/core";

import {
  buildFeatureMatrix,
  compareByHarness,
  compareByModel,
  diffSessions,
  harnessLabel,
} from "./compare.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<SessionUsageSummary> = {}): SessionUsageSummary {
  return {
    sessionId: "test-session",
    model: "claude-sonnet-4-6",
    usage: {
      inputTokens: 1000,
      outputTokens: 200,
      cacheCreationInputTokens: 500,
      cacheReadInputTokens: 1500,
    },
    estimatedCostUsd: 0.05,
    cacheEfficiency: { savedUsd: 0.01, hitRate: 0.75, wouldHavePaidUsd: 0.06 },
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
    userMessageCount: 5,
    assistantMessageCount: 5,
    ...overrides,
  };
}

// ─── harnessLabel ─────────────────────────────────────────────────────────────

describe("harnessLabel", () => {
  it("strips trailing 8-digit date suffix", () => {
    expect(harnessLabel("claude-3-5-sonnet-20241022")).toBe("claude-3-5-sonnet");
  });

  it("keeps model strings without a date suffix intact", () => {
    expect(harnessLabel("claude-opus-4-6")).toBe("claude-opus-4-6");
  });

  it("returns 'unknown' for null", () => {
    expect(harnessLabel(null)).toBe("unknown");
  });

  it("returns 'unknown' for undefined", () => {
    expect(harnessLabel(undefined)).toBe("unknown");
  });

  it("keeps non-date numeric suffixes", () => {
    // 6-digit suffix is NOT a date and should be kept
    expect(harnessLabel("some-model-123456")).toBe("some-model-123456");
  });
});

// ─── compareByModel ───────────────────────────────────────────────────────────

describe("compareByModel", () => {
  it("returns empty array for empty input", () => {
    expect(compareByModel([])).toEqual([]);
  });

  it("groups sessions by model and computes aggregates", () => {
    const summaries = [
      makeSummary({ sessionId: "a", model: "claude-sonnet-4-6", estimatedCostUsd: 0.1 }),
      makeSummary({ sessionId: "b", model: "claude-sonnet-4-6", estimatedCostUsd: 0.2 }),
      makeSummary({ sessionId: "c", model: "claude-opus-4-6", estimatedCostUsd: 0.5 }),
    ];
    const result = compareByModel(summaries);
    expect(result).toHaveLength(2);
    // sorted by totalCostUsd descending
    expect(result[0]?.model).toBe("claude-opus-4-6");
    expect(result[0]?.sessionCount).toBe(1);
    expect(result[1]?.model).toBe("claude-sonnet-4-6");
    expect(result[1]?.sessionCount).toBe(2);
    expect(result[1]?.totalCostUsd).toBeCloseTo(0.3);
    expect(result[1]?.costPerSession).toBeCloseTo(0.15);
  });

  it("computes cacheHitRate across all sessions for the model", () => {
    const summaries = [
      makeSummary({
        sessionId: "a",
        model: "m1",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 200,
          cacheReadInputTokens: 800,
        },
      }),
    ];
    const result = compareByModel(summaries);
    expect(result[0]?.cacheHitRate).toBeCloseTo(0.8); // 800 / (800 + 200)
  });

  it("assigns 0 cacheHitRate when no cache traffic", () => {
    const summaries = [
      makeSummary({
        model: "m-no-cache",
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
      }),
    ];
    const result = compareByModel(summaries);
    expect(result[0]?.cacheHitRate).toBe(0);
  });

  it("computes feature usage rates from optimizationState", () => {
    const summaries = [
      makeSummary({
        sessionId: "a",
        model: "m1",
        optimizationState: {
          compactionUsed: true,
          thinkingEnabled: false,
          taskAgentEnabled: false,
          mcpEnabled: false,
          webSearchEnabled: false,
          webFetchEnabled: false,
          cacheReadUsed: true,
          ephemeralCacheUsed: false,
          serviceTier: undefined,
          inferenceGeo: undefined,
        },
      }),
      makeSummary({ sessionId: "b", model: "m1" }),
    ];
    const result = compareByModel(summaries);
    expect(result[0]?.featureUsageRates["compaction"]).toBeCloseTo(0.5);
    expect(result[0]?.featureUsageRates["cache-read"]).toBeCloseTo(0.5);
    expect(result[0]?.featureUsageRates["thinking"]).toBeCloseTo(0);
  });
});

// ─── compareByHarness ─────────────────────────────────────────────────────────

describe("compareByHarness", () => {
  it("returns empty array for empty input", () => {
    expect(compareByHarness([])).toEqual([]);
  });

  it("groups by harnessLabel and sorts by cacheEfficiency descending", () => {
    const highCache = makeSummary({
      sessionId: "hc",
      model: "claude-3-5-sonnet-20241022",
      usage: {
        inputTokens: 0,
        outputTokens: 100,
        cacheCreationInputTokens: 100,
        cacheReadInputTokens: 900,
      },
      estimatedCostUsd: 0.1,
    });
    const lowCache = makeSummary({
      sessionId: "lc",
      model: "claude-opus-4-6",
      usage: {
        inputTokens: 0,
        outputTokens: 100,
        cacheCreationInputTokens: 900,
        cacheReadInputTokens: 100,
      },
      estimatedCostUsd: 0.2,
    });
    const result = compareByHarness([highCache, lowCache]);
    expect(result[0]?.harness).toBe("claude-3-5-sonnet");
    expect(result[0]?.cacheEfficiency).toBeCloseTo(0.9);
    expect(result[1]?.harness).toBe("claude-opus-4-6");
    expect(result[1]?.cacheEfficiency).toBeCloseTo(0.1);
  });

  it("computes costPerOutputToken", () => {
    const s = makeSummary({
      model: "m1",
      usage: {
        inputTokens: 0,
        outputTokens: 1000,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      estimatedCostUsd: 0.01,
    });
    const result = compareByHarness([s]);
    expect(result[0]?.costPerOutputToken).toBeCloseTo(0.00001); // 0.01 / 1000
  });
});

// ─── buildFeatureMatrix ───────────────────────────────────────────────────────

describe("buildFeatureMatrix", () => {
  it("returns empty harnesses for empty input", () => {
    const result = buildFeatureMatrix([]);
    expect(result.harnesses).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(0); // rows always emitted for all features
    for (const row of result.rows) {
      expect(Object.keys(row.byHarness)).toHaveLength(0);
    }
  });

  it("builds matrix with harnesses sorted", () => {
    const summaries = [
      makeSummary({ model: "claude-opus-4-6" }),
      makeSummary({ model: "claude-3-5-sonnet-20241022" }),
    ];
    const result = buildFeatureMatrix(summaries);
    expect(result.harnesses).toEqual(["claude-3-5-sonnet", "claude-opus-4-6"]);
  });

  it("computes usageRate for a feature across sessions", () => {
    const summaries = [
      makeSummary({
        sessionId: "a",
        model: "m1",
        optimizationState: {
          compactionUsed: true,
          thinkingEnabled: false,
          taskAgentEnabled: false,
          mcpEnabled: false,
          webSearchEnabled: false,
          webFetchEnabled: false,
          cacheReadUsed: false,
          ephemeralCacheUsed: false,
          serviceTier: undefined,
          inferenceGeo: undefined,
        },
      }),
      makeSummary({ sessionId: "b", model: "m1" }),
      makeSummary({ sessionId: "c", model: "m1" }),
    ];
    const result = buildFeatureMatrix(summaries);
    const compactionRow = result.rows.find((r) => r.feature === "compaction");
    expect(compactionRow?.byHarness["m1"]?.usageRate).toBeCloseTo(1 / 3);
    expect(compactionRow?.byHarness["m1"]?.sessionCount).toBe(1);
  });
});

// ─── diffSessions ─────────────────────────────────────────────────────────────

describe("diffSessions", () => {
  it("computes delta b minus a", () => {
    const a = makeSummary({
      sessionId: "session-a",
      model: "m1",
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      estimatedCostUsd: 0.05,
      userMessageCount: 5,
      assistantMessageCount: 5,
    });
    const b = makeSummary({
      sessionId: "session-b",
      model: "m1",
      usage: {
        inputTokens: 1500,
        outputTokens: 300,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      estimatedCostUsd: 0.08,
      userMessageCount: 8,
      assistantMessageCount: 8,
    });
    const diff = diffSessions(a, b);
    expect(diff.a.sessionId).toBe("session-a");
    expect(diff.b.sessionId).toBe("session-b");
    expect(diff.delta.tokens).toBe(1500 + 300 - (1000 + 200)); // 600
    expect(diff.delta.cost).toBeCloseTo(0.03);
    expect(diff.delta.turns).toBe(6);
  });

  it("snapshots include cacheHitRate", () => {
    const s = makeSummary({
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 200,
        cacheReadInputTokens: 800,
      },
    });
    const diff = diffSessions(s, s);
    expect(diff.a.cacheHitRate).toBeCloseTo(0.8);
    expect(diff.delta.cacheHitRate).toBeCloseTo(0);
  });
});

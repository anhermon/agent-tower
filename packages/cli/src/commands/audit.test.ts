import { describe, expect, it } from "vitest";

import type {
  CacheEfficiency,
  ModelUsage,
  SessionUsageSummary,
  SessionWasteSignals,
} from "@control-plane/core";

import { buildAudit } from "./audit.js";

const ZERO_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

const ZERO_CACHE: CacheEfficiency = {
  savedUsd: 0,
  hitRate: 0,
  wouldHavePaidUsd: 0,
};

function wasteSignals(overrides: Partial<SessionWasteSignals> = {}): SessionWasteSignals {
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

function summary(args: {
  readonly sessionId: string;
  readonly estimatedCostUsd: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cwd?: string;
  readonly waste?: SessionWasteSignals;
  readonly userTurns?: number;
  readonly assistantTurns?: number;
}): SessionUsageSummary {
  return {
    sessionId: args.sessionId,
    model: "claude-sonnet-4-5",
    usage: {
      ...ZERO_USAGE,
      inputTokens: args.inputTokens ?? 0,
      outputTokens: args.outputTokens ?? 0,
    },
    estimatedCostUsd: args.estimatedCostUsd,
    cacheEfficiency: ZERO_CACHE,
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
    userMessageCount: args.userTurns ?? 1,
    assistantMessageCount: args.assistantTurns ?? 1,
    cwd: args.cwd ?? "/repo/demo",
    ...(args.waste ? { waste: args.waste } : {}),
  };
}

describe("buildAudit", () => {
  it("given_mixed_summaries__when_building__then_shape_is_populated_and_waste_counts_exclude_untagged", () => {
    const summaries: readonly SessionUsageSummary[] = [
      summary({
        sessionId: "s1",
        estimatedCostUsd: 1.25,
        inputTokens: 100,
        outputTokens: 50,
        cwd: "/repo/alpha",
        waste: wasteSignals({
          cacheThrashRatio: 0.8, // high → saturates cache thrash
          distinctToolCount: 25,
          bloatWithoutCompaction: true,
          peakInputTokensBetweenCompactions: 200_000,
        }),
      }),
      summary({
        sessionId: "s2",
        estimatedCostUsd: 0.1,
        inputTokens: 10,
        outputTokens: 5,
        cwd: "/repo/alpha",
        waste: wasteSignals(), // clean
      }),
      summary({
        sessionId: "s3",
        estimatedCostUsd: 0.5,
        inputTokens: 20,
        outputTokens: 15,
        cwd: "/repo/beta",
        // no waste signals at all
      }),
    ];

    const report = buildAudit({
      summaries,
      skillsUsage: [],
      skillsEfficacy: [],
      dataRoot: "/tmp/root",
      limit: 10,
    });

    // Core totals
    expect(report.sessionsScanned).toBe(3);
    expect(report.totalEstimatedCostUsd).toBeCloseTo(1.85, 3);

    // topByCost: s1 highest, s3 middle, s2 lowest
    expect(report.topByCost.map((s) => s.sessionId)).toEqual(["s1", "s3", "s2"]);

    // topByWaste: s1 should lead because it has the populated signals
    expect(report.topByWaste[0]?.sessionId).toBe("s1");
    expect(report.topByWaste[0]?.overall).toBeGreaterThan(0);

    // Aggregates only consider sessions WITH waste signals (s1, s2).
    expect(report.wasteAggregates.sessionsWithWasteSignals).toBe(2);
    expect(report.wasteAggregates.bloatWithoutCompactionCount).toBe(1);
    expect(report.wasteAggregates.highWasteSessionCount).toBe(1);
    expect(report.wasteAggregates.avgOverall).toBeGreaterThan(0);

    // Projects aggregated by cwd; alpha accumulates s1+s2, beta just s3.
    const alpha = report.topProjects.find((p) => p.projectId === "/repo/alpha");
    expect(alpha?.sessions).toBe(2);
    expect(alpha?.totalCostUsd).toBeCloseTo(1.35, 3);
    const beta = report.topProjects.find((p) => p.projectId === "/repo/beta");
    expect(beta?.sessions).toBe(1);
  });
});

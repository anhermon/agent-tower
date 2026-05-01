import { describe, it, expect, vi } from "vitest";

import type { HarnessAdapter, HarnessDescriptor } from "./contracts/harness-adapter.js";
import { AdapterRegistry } from "./harness-registry.js";
import type { SessionUsageSummary } from "./domain/sessions.js";
import { EMPTY_CACHE_EFFICIENCY } from "./lib/pricing.js";

// ─── Minimal stub adapter ─────────────────────────────────────────────────────

function makeStubAdapter(kind: string, sessions: readonly SessionUsageSummary[]): HarnessAdapter {
  const descriptor: HarnessDescriptor = {
    kind,
    displayName: kind,
    dataRoot: `/fake/${kind}`,
  };
  return {
    descriptor,
    listProjectSummaries: vi.fn().mockResolvedValue([]),
    listSessionSummaries: vi.fn().mockResolvedValue(sessions),
    loadSessionUsage: vi.fn().mockResolvedValue(undefined),
    loadSessionReplay: vi.fn().mockResolvedValue(undefined),
    loadActivityTimeseries: vi
      .fn()
      .mockResolvedValue({
        range: { from: "", to: "" },
        daily: [],
        peakHours: [],
        dayOfWeek: [],
        streaks: { currentStreakDays: 0, longestStreakDays: 0, totalActiveDays: 0 },
      }),
    loadCostBreakdown: vi
      .fn()
      .mockResolvedValue({
        range: { from: "", to: "" },
        totalUsd: 0,
        byModel: [],
        daily: [],
        byProject: [],
        overallCacheEfficiency: EMPTY_CACHE_EFFICIENCY,
      }),
    loadToolAnalytics: vi
      .fn()
      .mockResolvedValue({
        tools: [],
        mcpServers: [],
        featureAdoption: {},
        versions: [],
        branches: [],
      }),
  };
}

function makeSession(id: string): SessionUsageSummary {
  return {
    sessionId: id,
    model: "test-model",
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
    estimatedCostUsd: 0.001,
    cacheEfficiency: EMPTY_CACHE_EFFICIENCY,
    toolCounts: {},
    flags: {
      hasCompaction: false,
      usesTaskAgent: false,
      usesMcp: false,
      usesWebSearch: false,
      usesWebFetch: false,
      hasThinking: false,
    },
    compactions: [],
    userMessageCount: 1,
    assistantMessageCount: 1,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AdapterRegistry", () => {
  it("starts empty", () => {
    const registry = new AdapterRegistry();
    expect(registry.isEmpty).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it("registers and retrieves an adapter by kind", () => {
    const registry = new AdapterRegistry();
    const adapter = makeStubAdapter("claude-code", []);
    registry.register(adapter);
    expect(registry.isEmpty).toBe(false);
    expect(registry.get("claude-code")).toBe(adapter);
  });

  it("replacing registration with same kind overwrites", () => {
    const registry = new AdapterRegistry();
    const a1 = makeStubAdapter("claude-code", []);
    const a2 = makeStubAdapter("claude-code", []);
    registry.register(a1).register(a2);
    expect(registry.list()).toHaveLength(1);
    expect(registry.get("claude-code")).toBe(a2);
  });

  it("supports unregister", () => {
    const registry = new AdapterRegistry();
    registry.register(makeStubAdapter("claude-code", []));
    registry.unregister("claude-code");
    expect(registry.isEmpty).toBe(true);
    expect(registry.get("claude-code")).toBeUndefined();
  });

  it("listAllSessionSummaries returns empty array when registry is empty", async () => {
    const registry = new AdapterRegistry();
    const results = await registry.listAllSessionSummaries();
    expect(results).toHaveLength(0);
  });

  it("listAllSessionSummaries tags each session with its harness kind", async () => {
    const registry = new AdapterRegistry();
    registry.register(makeStubAdapter("claude-code", [makeSession("s1"), makeSession("s2")]));
    registry.register(makeStubAdapter("codex", [makeSession("s3")]));

    const results = await registry.listAllSessionSummaries();
    expect(results).toHaveLength(3);

    const claudeSessions = results.filter((s) => s.harness === "claude-code");
    const codexSessions = results.filter((s) => s.harness === "codex");
    expect(claudeSessions).toHaveLength(2);
    expect(codexSessions).toHaveLength(1);
    expect(codexSessions[0]?.sessionId).toBe("s3");
  });

  it("swallows errors from individual adapters and returns results from healthy ones", async () => {
    const registry = new AdapterRegistry();
    const failingAdapter = makeStubAdapter("broken", []);
    (failingAdapter.listSessionSummaries as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("read failed")
    );
    registry.register(failingAdapter);
    registry.register(makeStubAdapter("claude-code", [makeSession("s1")]));

    const results = await registry.listAllSessionSummaries();
    expect(results).toHaveLength(1);
    expect(results[0]?.harness).toBe("claude-code");
  });

  it("passes filter through to each adapter's listSessionSummaries", async () => {
    const registry = new AdapterRegistry();
    const adapter = makeStubAdapter("claude-code", []);
    registry.register(adapter);

    const filter = { projectId: "my-project" };
    await registry.listAllSessionSummaries(filter);

    expect(adapter.listSessionSummaries).toHaveBeenCalledWith(filter);
  });
});

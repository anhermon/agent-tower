/* eslint-disable @typescript-eslint/require-await -- test mocks implement async interfaces with synchronous stubs */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  CostBreakdown,
  ProjectSummary,
  ReplayData,
  SessionAnalyticsFilter,
  SessionAnalyticsSource,
  SessionUsageSummary,
  Timeseries,
  ToolAnalytics,
} from "@control-plane/core";

import {
  __setAnalyticsSourceResolverForTests,
  getActivity,
  getCostBreakdown,
  getOverview,
  getToolAnalytics,
  listProjects,
  loadProject,
  loadReplay,
} from "./sessions-analytics";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const emptyUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
} as const;

const emptyCache = {
  savedUsd: 0,
  hitRate: 0,
  wouldHavePaidUsd: 0,
} as const;

const emptyFlags = {
  hasCompaction: false,
  hasThinking: false,
  usesTaskAgent: false,
  usesMcp: false,
  usesWebSearch: false,
  usesWebFetch: false,
} as const;

function makeSession(overrides: Partial<SessionUsageSummary> = {}): SessionUsageSummary {
  return {
    sessionId: "s1",
    model: "claude-test",
    usage: emptyUsage,
    estimatedCostUsd: 0,
    cacheEfficiency: emptyCache,
    toolCounts: {},
    flags: emptyFlags,
    compactions: [],
    userMessageCount: 0,
    assistantMessageCount: 0,
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "proj-a",
    displayPath: "/tmp/proj-a",
    displayName: "proj-a",
    sessionCount: 1,
    firstActive: "2026-01-01T00:00:00.000Z",
    lastActive: "2026-01-01T00:00:00.000Z",
    totalDurationMs: 0,
    totalMessages: 0,
    estimatedCostUsd: 0,
    usage: emptyUsage,
    cacheEfficiency: emptyCache,
    toolCounts: {},
    languages: {},
    branches: [],
    flags: emptyFlags,
    ...overrides,
  };
}

function makeTimeseries(): Timeseries {
  return {
    range: { from: "2026-01-01", to: "2026-01-01" },
    daily: [],
    peakHours: [],
    dayOfWeek: [],
    streaks: {
      currentStreakDays: 0,
      longestStreakDays: 0,
      mostActiveDate: null,
      mostActiveDayMessageCount: 0,
    },
  };
}

function makeCostBreakdown(totalUsd = 0): CostBreakdown {
  return {
    range: { from: "2026-01-01", to: "2026-01-01" },
    totalUsd,
    byModel: [],
    daily: [],
    byProject: [],
    overallCacheEfficiency: emptyCache,
  };
}

function makeToolAnalytics(): ToolAnalytics {
  return {
    tools: [],
    mcpServers: [],
    featureAdoption: {},
    versions: [],
    branches: [],
    totalToolCalls: 0,
    totalErrors: 0,
  };
}

interface FakeSourceOptions {
  readonly projects?: readonly ProjectSummary[];
  readonly sessions?: readonly SessionUsageSummary[];
  readonly timeseries?: Timeseries;
  readonly costs?: CostBreakdown;
  readonly tools?: ToolAnalytics;
  readonly replay?: ReplayData;
  readonly throwOn?: keyof SessionAnalyticsSource;
}

function makeFakeSource(opts: FakeSourceOptions = {}): SessionAnalyticsSource {
  const guard = <T>(method: keyof SessionAnalyticsSource, value: T): T => {
    if (opts.throwOn === method) throw new Error(`boom:${String(method)}`);
    return value;
  };

  return {
    listProjectSummaries: async () => guard("listProjectSummaries", opts.projects ?? []),
    listSessionSummaries: async (filter?: SessionAnalyticsFilter) => {
      const all = opts.sessions ?? [];
      let result = all;
      if (filter?.projectId) {
        result = result.filter((s) => s.cwd === filter.projectId);
      }
      return guard("listSessionSummaries", result);
    },
    loadSessionUsage: async (id) =>
      guard(
        "loadSessionUsage",
        (opts.sessions ?? []).find((s) => s.sessionId === id)
      ),
    loadSessionReplay: async () => guard("loadSessionReplay", opts.replay),
    loadActivityTimeseries: async () =>
      guard("loadActivityTimeseries", opts.timeseries ?? makeTimeseries()),
    loadCostBreakdown: async () => guard("loadCostBreakdown", opts.costs ?? makeCostBreakdown()),
    loadToolAnalytics: async () => guard("loadToolAnalytics", opts.tools ?? makeToolAnalytics()),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sessions-analytics", () => {
  afterEach(() => {
    __setAnalyticsSourceResolverForTests(null);
  });

  describe("given_no_configured_source", () => {
    beforeEach(() => {
      __setAnalyticsSourceResolverForTests(() => null);
    });

    it("returns_unconfigured_for_getOverview", async () => {
      expect(await getOverview()).toEqual({ ok: false, reason: "unconfigured" });
    });

    it("returns_unconfigured_for_listProjects", async () => {
      expect(await listProjects()).toEqual({ ok: false, reason: "unconfigured" });
    });

    it("returns_unconfigured_for_loadProject", async () => {
      expect(await loadProject("x")).toEqual({ ok: false, reason: "unconfigured" });
    });

    it("returns_unconfigured_for_loadReplay", async () => {
      expect(await loadReplay("x")).toEqual({ ok: false, reason: "unconfigured" });
    });

    it("returns_unconfigured_for_getCostBreakdown", async () => {
      expect(await getCostBreakdown()).toEqual({ ok: false, reason: "unconfigured" });
    });

    it("returns_unconfigured_for_getToolAnalytics", async () => {
      expect(await getToolAnalytics()).toEqual({ ok: false, reason: "unconfigured" });
    });

    it("returns_unconfigured_for_getActivity", async () => {
      expect(await getActivity()).toEqual({ ok: false, reason: "unconfigured" });
    });
  });

  describe("given_a_working_source", () => {
    it("getOverview_returns_aggregated_totals_plus_timeseries", async () => {
      const sessions = [
        makeSession({
          sessionId: "s1",
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadInputTokens: 10,
            cacheCreationInputTokens: 5,
          },
          userMessageCount: 3,
          assistantMessageCount: 4,
          toolCounts: { Read: 2, Bash: 1 },
        }),
        makeSession({
          sessionId: "s2",
          usage: {
            inputTokens: 200,
            outputTokens: 75,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
          userMessageCount: 1,
          assistantMessageCount: 2,
          toolCounts: { Edit: 5 },
        }),
      ];
      __setAnalyticsSourceResolverForTests(() =>
        makeFakeSource({
          sessions,
          costs: makeCostBreakdown(1.2345),
        })
      );

      const result = await getOverview();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.sessionCount).toBe(2);
      expect(result.value.messageCount).toBe(3 + 4 + 1 + 2);
      expect(result.value.toolCallCount).toBe(2 + 1 + 5);
      expect(result.value.totalInputTokens).toBe(300);
      expect(result.value.totalOutputTokens).toBe(125);
      expect(result.value.totalCacheReadTokens).toBe(10);
      expect(result.value.totalCacheCreationTokens).toBe(5);
      expect(result.value.estimatedCostUsd).toBe(1.2345);
      expect(result.value.timeseries).toBeDefined();
    });

    it("listProjects_returns_the_source_rows", async () => {
      const project = makeProject();
      __setAnalyticsSourceResolverForTests(() => makeFakeSource({ projects: [project] }));
      const result = await listProjects();
      expect(result).toEqual({ ok: true, value: [project] });
    });

    it("loadProject_returns_undefined_when_slug_missing", async () => {
      __setAnalyticsSourceResolverForTests(() => makeFakeSource({ projects: [] }));
      const result = await loadProject("missing");
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it("loadProject_returns_the_project_and_scoped_sessions", async () => {
      const project = makeProject({ id: "/tmp/alpha", displayPath: "/tmp/alpha" });
      const sessions = [
        makeSession({ sessionId: "s1", cwd: "/tmp/alpha" }),
        makeSession({ sessionId: "s2", cwd: "/tmp/other" }),
      ];
      __setAnalyticsSourceResolverForTests(() => makeFakeSource({ projects: [project], sessions }));
      const result = await loadProject("/tmp/alpha");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value?.project).toEqual(project);
      expect(result.value?.sessions).toHaveLength(1);
      expect(result.value?.sessions[0]!.sessionId).toBe("s1");
    });

    it("loadReplay_passes_through_the_replay", async () => {
      const replay = { sessionId: "sX", turns: [], compactions: [] } as unknown as ReplayData;
      __setAnalyticsSourceResolverForTests(() => makeFakeSource({ replay }));
      const result = await loadReplay("sX");
      expect(result).toEqual({ ok: true, value: replay });
    });

    it("getCostBreakdown_returns_the_breakdown", async () => {
      const costs = makeCostBreakdown(9.99);
      __setAnalyticsSourceResolverForTests(() => makeFakeSource({ costs }));
      const result = await getCostBreakdown();
      expect(result).toEqual({ ok: true, value: costs });
    });

    it("getToolAnalytics_returns_the_analytics", async () => {
      const tools = makeToolAnalytics();
      __setAnalyticsSourceResolverForTests(() => makeFakeSource({ tools }));
      const result = await getToolAnalytics();
      expect(result).toEqual({ ok: true, value: tools });
    });

    it("getActivity_returns_the_timeseries", async () => {
      const ts = makeTimeseries();
      __setAnalyticsSourceResolverForTests(() => makeFakeSource({ timeseries: ts }));
      const result = await getActivity();
      expect(result).toEqual({ ok: true, value: ts });
    });
  });

  describe("given_a_source_that_throws", () => {
    it("returns_ok_false_with_reason_error_and_message", async () => {
      __setAnalyticsSourceResolverForTests(() =>
        makeFakeSource({ throwOn: "listProjectSummaries" })
      );
      const result = await listProjects();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("error");
      if (result.reason !== "error") return;
      expect(result.message).toContain("boom:listProjectSummaries");
    });

    it("returns_error_for_getOverview_when_any_underlying_call_throws", async () => {
      __setAnalyticsSourceResolverForTests(() =>
        makeFakeSource({ throwOn: "loadActivityTimeseries" })
      );
      const result = await getOverview();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("error");
    });

    it("coerces_non_Error_throws_to_string_message", async () => {
      const source: SessionAnalyticsSource = {
        listProjectSummaries: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentionally testing non-Error throw coercion
          throw "plain-string-rejection";
        },
        listSessionSummaries: async () => [],
        loadSessionUsage: async () => undefined,
        loadSessionReplay: async () => undefined,
        loadActivityTimeseries: async () => makeTimeseries(),
        loadCostBreakdown: async () => makeCostBreakdown(),
        loadToolAnalytics: async () => makeToolAnalytics(),
      };
      __setAnalyticsSourceResolverForTests(() => source);
      const result = await listProjects();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("error");
      if (result.reason !== "error") return;
      expect(result.message).toBe("plain-string-rejection");
    });
  });
});

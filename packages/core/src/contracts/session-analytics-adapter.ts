import type { AdapterContext, AdapterLifecycle } from "./common.js";
import type { CostBreakdown, DateRange, Timeseries, ToolAnalytics } from "../domain/analytics.js";
import type { ProjectSummary } from "../domain/projects.js";
import type { ReplayData } from "../domain/replay.js";
import type { SessionUsageSummary } from "../domain/sessions.js";

export interface SessionAnalyticsFilter {
  readonly projectId?: string;
  readonly range?: DateRange;
}

/**
 * Capability: `session-analytics`.
 *
 * Read-side contract for any adapter that can derive canonical analytics
 * (per-session usage rollups, per-project rollups, time-series, costs, tool
 * analytics, and canonical replay) from its underlying data. All methods are
 * read-only and must tolerate missing / partial data — callers treat a
 * missing optional field as "not available" rather than an error.
 */
export interface SessionAnalyticsSource extends AdapterLifecycle {
  readonly listProjectSummaries: (context?: AdapterContext) => Promise<readonly ProjectSummary[]>;

  readonly listSessionSummaries: (
    filter?: SessionAnalyticsFilter,
    context?: AdapterContext
  ) => Promise<readonly SessionUsageSummary[]>;

  readonly loadSessionUsage: (
    sessionId: string,
    context?: AdapterContext
  ) => Promise<SessionUsageSummary | undefined>;

  readonly loadSessionReplay: (
    sessionId: string,
    context?: AdapterContext
  ) => Promise<ReplayData | undefined>;

  readonly loadActivityTimeseries: (
    range?: DateRange,
    context?: AdapterContext
  ) => Promise<Timeseries>;

  readonly loadCostBreakdown: (
    range?: DateRange,
    context?: AdapterContext
  ) => Promise<CostBreakdown>;

  readonly loadToolAnalytics: (context?: AdapterContext) => Promise<ToolAnalytics>;
}

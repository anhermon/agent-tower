import type { CacheEfficiency, ModelUsage } from "./costs.js";

// ─── Phase 1 Wave 0: sessions-superset additions ──────────────────────────────
// Canonical, adapter-agnostic analytics shapes. These back the overview /
// costs / tools / activity pages, and also the per-project / per-session
// drill-downs. Pure data — no functions, no runtime imports.

/** Inclusive date range bounded by calendar dates in `YYYY-MM-DD` form. */
export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export interface TimeseriesPoint {
  readonly date: string;
  readonly sessionCount: number;
  readonly messageCount: number;
  readonly toolCallCount: number;
  readonly estimatedCostUsd: number;
}

export interface DayOfWeekBin {
  readonly day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly sessionCount: number;
  readonly messageCount: number;
}

export interface HourBin {
  readonly hour: number;
  readonly messageCount: number;
}

export interface StreakStats {
  readonly currentStreakDays: number;
  readonly longestStreakDays: number;
  readonly mostActiveDate: string | null;
  readonly mostActiveDayMessageCount: number;
}

export interface Timeseries {
  readonly range: DateRange;
  readonly daily: readonly TimeseriesPoint[];
  readonly peakHours: readonly HourBin[];
  readonly dayOfWeek: readonly DayOfWeekBin[];
  readonly streaks: StreakStats;
}

export interface ModelCostBreakdown {
  readonly model: string;
  readonly usage: ModelUsage;
  readonly estimatedCostUsd: number;
  readonly cacheEfficiency: CacheEfficiency;
}

export interface DailyCostPoint {
  readonly date: string;
  readonly totalUsd: number;
  readonly byModel: Readonly<Record<string, number>>;
}

export interface ProjectCostRow {
  readonly projectId: string;
  readonly displayName: string;
  readonly estimatedCostUsd: number;
  readonly usage: ModelUsage;
}

export interface CostBreakdown {
  readonly range: DateRange;
  readonly totalUsd: number;
  readonly byModel: readonly ModelCostBreakdown[];
  readonly daily: readonly DailyCostPoint[];
  readonly byProject: readonly ProjectCostRow[];
  readonly overallCacheEfficiency: CacheEfficiency;
}

export interface ToolSummary {
  readonly name: string;
  readonly category: string;
  readonly totalCalls: number;
  readonly sessionCount: number;
  readonly errorCount: number;
}

export interface McpServerTool {
  readonly name: string;
  readonly calls: number;
}

export interface McpServerSummary {
  readonly serverName: string;
  readonly tools: readonly McpServerTool[];
  readonly totalCalls: number;
  readonly sessionCount: number;
}

export interface FeatureAdoption {
  readonly sessions: number;
  readonly pct: number;
}

export interface VersionRecord {
  readonly version: string;
  readonly sessionCount: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

export interface BranchRow {
  readonly branch: string;
  readonly turnCount: number;
}

export interface ToolAnalytics {
  readonly tools: readonly ToolSummary[];
  readonly mcpServers: readonly McpServerSummary[];
  readonly featureAdoption: Readonly<Record<string, FeatureAdoption>>;
  readonly versions: readonly VersionRecord[];
  readonly branches: readonly BranchRow[];
  readonly totalToolCalls: number;
  readonly totalErrors: number;
}

"use client";

import dynamic from "next/dynamic";

/**
 * Client-only lazy wrappers for every Recharts-backed chart in this folder.
 *
 * Server pages import chart components from `@/components/sessions/charts/_lazy`
 * instead of the concrete files so that Recharts (~100 kB gz) is deferred out
 * of the initial route chunk. `ssr: false` is legal here because this module
 * is `"use client"`; it would throw if set from a server component file.
 *
 * Charts that do not use Recharts (sparkline, activity-heatmap,
 * token-breakdown-bars, branch-leaderboard, streak-card,
 * feature-adoption-table, mcp-server-panel, model-token-table,
 * version-history-table) are not wrapped here — they import directly.
 */

const ChartSkeleton = ({ height = 240 }: { readonly height?: number }) => (
  <div className="w-full animate-pulse rounded-sm bg-white/[0.03]" style={{ height }} aria-hidden />
);

export const CacheEfficiencyPanel = dynamic(
  () => import("./cache-efficiency-panel").then((m) => m.CacheEfficiencyPanel),
  { ssr: false, loading: () => <ChartSkeleton height={260} /> }
);

export const CostByProjectChart = dynamic(
  () => import("./cost-by-project-chart").then((m) => m.CostByProjectChart),
  { ssr: false, loading: () => <ChartSkeleton height={320} /> }
);

export const CostOverTimeChart = dynamic(
  () => import("./cost-over-time-chart").then((m) => m.CostOverTimeChart),
  { ssr: false, loading: () => <ChartSkeleton height={280} /> }
);

export const DayOfWeekChart = dynamic(
  () => import("./day-of-week-chart").then((m) => m.DayOfWeekChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> }
);

export const ModelBreakdownDonut = dynamic(
  () => import("./model-breakdown-donut").then((m) => m.ModelBreakdownDonut),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> }
);

export const PeakHoursChart = dynamic(
  () => import("./peak-hours-chart").then((m) => m.PeakHoursChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> }
);

export const ProjectActivityDonut = dynamic(
  () => import("./project-activity-donut").then((m) => m.ProjectActivityDonut),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> }
);

export const ToolRankingChart = dynamic(
  () => import("./tool-ranking-chart").then((m) => m.ToolRankingChart),
  { ssr: false, loading: () => <ChartSkeleton height={320} /> }
);

export const UsageOverTimeChart = dynamic(
  () => import("./usage-over-time-chart").then((m) => m.UsageOverTimeChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> }
);

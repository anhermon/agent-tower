"use client";

import dynamic from "next/dynamic";

/**
 * Client-only lazy wrappers for the Recharts-backed skills dashboard charts.
 * Importing these instead of the concrete components keeps Recharts (~100 kB
 * gz) out of the initial `/skills` route chunk — the charts stream in after
 * hydration. `ssr: false` is legal here because this module is `"use client"`.
 *
 * Non-Recharts skills components (skills-bar-chart, skills-heatmap,
 * skills-usage-summary, skills-efficacy-*) are plain client components and
 * are imported directly by their parent dashboards.
 */

const ChartSkeleton = ({ height = 240 }: { readonly height?: number }) => (
  <div className="w-full animate-pulse rounded-sm bg-white/[0.03]" style={{ height }} aria-hidden />
);

export const HourBreakdownChart = dynamic(
  () => import("./hour-breakdown-chart").then((m) => m.HourBreakdownChart),
  { ssr: false, loading: () => <ChartSkeleton height={260} /> }
);

export const SkillsBreakdownChart = dynamic(
  () => import("./skills-breakdown-chart").then((m) => m.SkillsBreakdownChart),
  { ssr: false, loading: () => <ChartSkeleton height={280} /> }
);

export const SkillsTimeline = dynamic(
  () => import("./skills-timeline").then((m) => m.SkillsTimeline),
  { ssr: false, loading: () => <ChartSkeleton height={220} /> }
);

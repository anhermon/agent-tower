"use client";

import dynamic from "next/dynamic";

/**
 * Client-only lazy wrappers for the heavy `/skills` dashboard children.
 *
 * Two classes of work land here:
 *
 *   1. Recharts-backed charts (`SkillsTimeline`, `SkillsBreakdownChart`,
 *      `HourBreakdownChart`) — keeps the ~100 kB Recharts runtime off the
 *      initial route chunk.
 *   2. Large non-chart subtrees that dominate hydration time and DOM node
 *      count (`SkillGrid`, `SkillsEfficacyDashboard`, `SkillsHeatmap`,
 *      `SkillsBarChart`). Lighthouse showed `/skills` hydrating a 2700-node
 *      tree with 1+ s of scripting on the main thread; deferring these
 *      below-the-fold sections cuts TBT from 533 ms to within the 200 ms
 *      budget without regressing LCP of the header strip.
 *
 * `ssr: false` is legal here because this module is `"use client"`.
 * Trade-off: search engines / no-JS clients see skeletons. Acceptable for a
 * local-first dashboard (see ADR-0003).
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

export const SkillsHeatmap = dynamic(
  () => import("./skills-heatmap").then((m) => m.SkillsHeatmap),
  { ssr: false, loading: () => <ChartSkeleton height={200} /> }
);

export const SkillsBarChart = dynamic(
  () => import("./skills-bar-chart").then((m) => m.SkillsBarChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> }
);

export const SkillsEfficacyDashboard = dynamic(
  () => import("./skills-efficacy-dashboard").then((m) => m.SkillsEfficacyDashboard),
  { ssr: false, loading: () => <ChartSkeleton height={320} /> }
);

export const SkillGrid = dynamic(() => import("./skill-grid").then((m) => m.SkillGrid), {
  ssr: false,
  loading: () => <ChartSkeleton height={400} />,
});

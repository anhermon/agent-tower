# 0004 — `recharts` for analytics charts

- **Status:** accepted
- **Date:** 2026-04-23
- **Deciders:** control-plane maintainers

## Context

Wave 4 of the sessions-superset plan introduces an analytics surface
(overview dashboard, costs, tools, activity) that requires line charts,
bar charts, donuts, sparklines, and a heatmap. We need one charting
library that handles React 19 + SSR, composes well with Tailwind, and
renders in a Next.js App Router server/client split without dragging
in a runtime data-store or headless-browser dependency. Wave 0 already
validated cost parity against cc-lens' own `/api/stats`, so whichever
library we pick must at minimum match cc-lens' numeric output exactly;
any visual differences are additive.

## Decision

Adopt `recharts@^3.7.0` as the single chart library for every
sessions-analytics surface except the activity heatmap (which is a
pure SVG grid — no chart primitive buys us anything there).

- Scope: only the `apps/web` workspace takes the runtime dependency.
  `packages/*` stay pure-types with `sideEffects: false`.
- Only use composable primitives (`LineChart`, `BarChart`, `PieChart`,
  `AreaChart`, `ResponsiveContainer`). No experimental/ESM-only add-ons.
- All chart components live under `apps/web/components/sessions/charts/`
  and render as client components; server pages pass plain data props
  from `lib/sessions-analytics.ts`.

## Consequences

- Single dependency added to `apps/web`; tree-shakes well in
  production builds (cc-lens evidence: ~45 KB gzipped against the
  same chart set).
- Keyboard/aria affordances are the caller's responsibility; every
  chart component must add `role`, `aria-label`, and focusable
  legends where applicable (DoD gate).
- If `recharts` later drops React 19 support or regresses, the
  migration cost is bounded to `apps/web/components/sessions/charts/`.
  The `SessionAnalyticsSource` contract is chart-agnostic.

## Alternatives considered

- **`visx`** — excellent low-level SVG primitives, D3-ergonomic, but
  higher authoring cost per chart. Rejected: we ship 10+ charts; the
  incremental code per chart outweighs the flexibility benefit.
- **`@nivo/*`** — polished visuals, but heavier bundle and per-chart
  packages inflate `apps/web` install size. Rejected on size + churn.
- **Vanilla SVG / D3** — viable for single-purpose charts but a poor
  fit for 10+ mixed chart types. We keep SVG for the heatmap only.
- **ECharts** — powerful but canvas-first, worse for a11y and
  server-rendered screenshots. Rejected.

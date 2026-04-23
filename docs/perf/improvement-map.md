# Improvement Map — 2026-04-23

Consolidated output of 4 parallel performance-reviewer investigations. All
four reports converged on the same root cause.

## Root cause (validated across 4 routes)

**No `next/dynamic` usage anywhere in the codebase** (grep confirmed). Every
`"use client"` chart component statically imports Recharts at module top
level, so the full Recharts runtime lands in each route's entry chunk.
Similarly `react-syntax-highlighter`, `react-markdown`, and `react-day-picker`
are statically imported wherever they're referenced.

Total waste reachable via static imports on the heaviest routes:
- Recharts + d3-shape/scale/array: ~100 kB gz
- react-syntax-highlighter (Prism) + one-dark + refractor + all languages: ~150 kB gz
- react-markdown + remark-gfm + unified/micromark graph: ~60 kB gz
- react-day-picker + date-fns transitive: ~30 kB gz

## Per-route hypothesis → validated enhancement

### 1. `/sessions/[id]` — 493 kB First-Load → target ≤ 200 kB

| Offender | Location | Evidence | Fix |
|---|---|---|---|
| react-syntax-highlighter (Prism + one-dark + every language) | `components/sessions/replay/assistant-markdown.tsx:4-9` | eager top-level import, rendered unconditionally per turn | Split `CodeBlock` into its own module, `dynamic(... {ssr:false})`; switch to `react-syntax-highlighter/dist/esm/prism-light` + `registerLanguage` for {ts, js, tsx, json, bash, python, go, md}. **-140 to -160 kB** |
| react-markdown + remark-gfm | `assistant-markdown.tsx:4,9` | static graph from `turn-card.tsx:7` → `session-detail.tsx:121` | `dynamic(AssistantMarkdown, {ssr:false})` with `<pre>` fallback. **-50 to -65 kB** |
| Recharts via `TokenAccumulationChart` | `session-detail.tsx:9`, `token-accumulation-chart.tsx:4-14` | eager, chart is below-the-fold decorative | `dynamic(TokenAccumulationChart, {ssr:false})`. **-90 to -105 kB** |
| Large session runtime | `session-detail.tsx` loops over all turns | O(n) renders on any session regardless of size | Memoize `TurnCard` + `content-visibility: auto` or `react-window` when turns > 100 (follow-up, runtime only). |

What's right: `page.tsx` is server-only, `toGridItem` convention applied. Don't regress.

### 2. `/sessions/overview` — 257 kB → target ≤ 200 kB

| Offender | Location | Fix |
|---|---|---|
| Recharts (5 chart components) | `UsageOverTimeChart`, `PeakHoursChart`, `ModelBreakdownDonut`, `ProjectActivityDonut`, `Sparkline` | Move to lazy wrapper file `components/sessions/charts/_lazy.tsx` exporting each via `dynamic`. **-90 to -100 kB** |
| `Sparkline` using Recharts for 4 tiny stat cards | `charts/sparkline.tsx:3` | Replace with inline `<svg><polyline/></svg>`. Removes Recharts from above-the-fold. **~0 kB on its own but unblocks lazy-loading of the rest** |
| `react-day-picker` + CSS | `date-range-picker.tsx:5-6` | `dynamic` `DayPicker` behind `open===true`. **-25 to -30 kB** |

### 3. `/skills` — 250 kB → target ≤ 200 kB

| Offender | Location | Fix |
|---|---|---|
| Recharts (3 chart components) | `skills-timeline.tsx:4`, `skills-breakdown-chart.tsx:4-13`, `hour-breakdown-chart.tsx:4-13` | Same `_lazy.tsx` pattern — dynamic wrappers at import sites in `skills-dashboard.tsx` / `skills-efficacy-dashboard.tsx`. **-90 to -100 kB** |
| `react-day-picker` | same as above | shared fix from route 2. **-25 to -30 kB** |

No markdown/syntax-highlighter/cmdk on this route — confirmed. `toGridItem` RSC strip is already correct.

### 4. `/sessions/costs` (249 kB) + `/sessions/activity` (247 kB)

Same fix as route 2. Server-side aggregation is **already correct** in
`apps/web/lib/sessions-analytics.ts` (`getCostBreakdown`, `getActivity`) —
do not refactor that. `useMemo` blocks in chart components operate on
already-aggregated data, cheap. The bottleneck is purely Recharts bundle
weight.

Combined expected deltas per route:

| Route | Before | After (projected) | Δ |
|---|---:|---:|---:|
| `/sessions/[id]` | 493 kB | 160-210 kB | **-280 to -330 kB** |
| `/sessions/overview` | 257 kB | 130-140 kB | **-120 kB** |
| `/skills` | 250 kB | 125-135 kB | **-115 kB** |
| `/sessions/costs` | 249 kB | 135-155 kB | **-95 to -115 kB** |
| `/sessions/activity` | 247 kB | 135-155 kB | **-95 to -115 kB** |
| `/sessions/tools` | 215 kB | ~130 kB | **-85 kB** (inferred from same pattern) |

## Work streams (parallel)

- **Stream A** — Shared chart lazy wrapper + retarget all chart-heavy pages + rewrite `Sparkline` to plain SVG.
- **Stream B** — `/sessions/[id]`-specific: split `CodeBlock`, subset Prism languages, dynamic `TokenAccumulationChart`, dynamic `AssistantMarkdown`.
- **Stream C** — `DateRangePicker` lazy `DayPicker` (shared fix across overview/costs/activity/skills).

## Validation method (used by every implementation agent)

```bash
pnpm --filter @control-plane/web build 2>&1 | grep -E "/(sessions|skills)"
```
The table printed by `next build` shows First-Load JS per route. The implementation agent must paste the before/after numbers in its report.

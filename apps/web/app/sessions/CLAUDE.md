# Sessions module — local contract

Owns `/sessions`, `/sessions/[id]`, and five analytics sub-routes:
`overview`, `projects`, `activity`, `costs`, `tools`. Shared `layout.tsx` renders
the sub-nav above every child route. Full product spec: [`docs/modules/sessions.md`](../../../../docs/modules/sessions.md).

## Read First
- `page.tsx` — list view backed by `listSessionsOrEmpty()`.
- `layout.tsx` — mounts `<SessionsSubNav>` on every `/sessions/**` route.
- `[id]/page.tsx` + `[id]/file/route.ts` — session detail + raw file stream endpoint.
- `../../lib/sessions-source.ts` — session catalogue + `getConfiguredDataRoot()` / `CLAUDE_DATA_ROOT_ENV`.
- `../../lib/sessions-analytics.ts` — `getOverview` / `getActivity` / `getCostBreakdown` / `getToolAnalytics` wrappers around the `SessionAnalyticsSource` capability.
- `../../components/sessions/date-range.ts` — server-safe `resolveRangeFromSearchParams` helper.
- `../../components/sessions/date-range-picker.tsx` — `"use client"` picker that writes `?from=&to=` / `?preset=` to the URL.

## Data flow

```
searchParams ──► resolveRangeFromSearchParams ──► DateRange
                                                   │
sessions-source ──► listSessionsOrEmpty ──────────┤
sessions-analytics ──► getOverview / getActivity ─┴──► page.tsx → client charts
                        / getCostBreakdown        │
                        / getToolAnalytics        │
```

Every analytics page is `dynamic = "force-dynamic"` and `await`s `searchParams`
before calling the source. No client fetches — the server re-renders on every
URL change.

## Charts
- Recharts 3 everywhere (`apps/web/components/sessions/charts/*`).
- `charts/_lazy.tsx` is the canonical pattern: `next/dynamic(() => import(...), { ssr: false, loading: <Skeleton/> })` to keep Recharts out of the initial route chunk.
- Custom dark tooltip lives inline in each chart file (`rounded-sm border border-line/70 bg-panel/95 ...`). Reuse that shape — don't import third-party tooltip components.
- Grid / axis colors: `rgb(var(--color-line))` and `rgb(var(--color-muted))`. No hard-coded slate values.

## Local Conventions
- **Server-only analytics.** `lib/sessions-analytics.ts` is `"server-only"`. Pages pass only the `DateRange` + serialized analytics result to client charts.
- **`searchParams` is a Promise.** Every analytics page types it as `Promise<Record<string, string | string[] | undefined>>` and `await`s it before anything else.
- **URL-driven filter state.** The picker never uses localStorage. The URL is the source of truth; the server reads it and re-fetches.
- **UTC bucketing.** Day / hour keys are UTC — Playwright fixtures depend on this.

## Sharp Edges
- `layout.tsx` wraps EVERY child route, including `[id]`. If a future child needs to opt out of the sub-nav, fork the layout — don't hide the nav conditionally.
- `/sessions/[id]` expects the id URL-encoded; the server `decodeURIComponent`s it. Keep that contract if you add nested routes.
- The analytics source is capability-bound (`SessionAnalyticsSource` in `packages/core`). Do NOT reach into `@control-plane/adapter-claude-code` directly from a page — go through the `lib/sessions-analytics.ts` wrapper so the MCP server + CLI stay aligned.
- `replay/` components under `components/sessions/replay/` render large transcript trees; keep heavy nodes behind `next/dynamic` with `ssr: false` (see `token-accumulation-chart-lazy.tsx` for the shape).

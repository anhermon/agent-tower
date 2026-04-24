# Sessions module — local contract

This directory owns the `/sessions`, `/sessions/[id]`, and all analytics
sub-routes. The data half lives in `apps/web/lib/sessions-source.ts` and
`apps/web/lib/sessions-analytics.ts`; the rendered atoms live in
`apps/web/components/sessions/`.

## Route inventory

| Route | File | Purpose |
|---|---|---|
| `/sessions` | `page.tsx` | Session list with filters, sort, and pagination |
| `/sessions/overview` | `overview/page.tsx` | Aggregate stats, timeseries charts, token breakdown |
| `/sessions/projects` | `projects/page.tsx` | Project grid derived from transcript `cwd` |
| `/sessions/projects/[slug]` | `projects/[slug]/page.tsx` | Per-project detail with scoped session table |
| `/sessions/costs` | `costs/page.tsx` | Cost analysis, cache efficiency, model breakdown |
| `/sessions/tools` | `tools/page.tsx` | Tool ranking, MCP servers, feature adoption |
| `/sessions/activity` | `activity/page.tsx` | Streaks, heatmap, peak hours, day-of-week |
| `/sessions/[id]` | `[id]/page.tsx` | Full session replay with turn-by-turn transcript |
| `/sessions/[id]/export` | `[id]/export/route.ts` | Self-contained HTML export (read-only GET) |
| `/sessions/[id]/file` | `[id]/file/route.ts` | Scoped file preview for files referenced in cwd |

The shared `layout.tsx` renders `<SessionsSubNav>` and `<KeyboardNavProvider>`
above every child route. Do not remove or condition-wrap these — see the
`CLAUDE.md` sharp edge note.

## Boundary

- **Canonical types only.** Pages and components consume types from
  `@control-plane/core` (`ReplayData`, `ProjectSummary`, `SessionUsageSummary`,
  `SessionDerivedFlags`, `ToolAnalytics`, `CostBreakdown`, `Timeseries`, etc.).
  Do not import from `@control-plane/adapter-claude-code` in any page, layout,
  or component file.
- **Data wiring.** All analytics calls go through `lib/sessions-analytics.ts`
  (not directly to the adapter) so the MCP server and CLI share the same
  capability path. `lib/sessions-source.ts` provides session listing and raw
  file operations.
- **Server-only filesystem access.** `node:fs` is allowed only in files marked
  `import "server-only"` or in server-only API routes. The one exception in
  components is `components/sessions/system-info-panel.tsx`, which carries the
  `server-only` guard and is used only as a server component.
- **Read-only.** No writes, no mutations, no POST/PUT/DELETE handlers inside
  this directory (except the two GET route handlers above).

## Data flow

```
searchParams (Promise) → resolveRangeFromSearchParams → DateRange
                                                           │
sessions-source  → listSessionsOrEmpty ───────────────────┤
sessions-analytics → getOverview / getActivity  ──────────┴──► page → charts
                   → getCostBreakdown
                   → getToolAnalytics
                   → loadReplay
                   → listProjects / loadProject
```

Every analytics page sets `export const dynamic = "force-dynamic"` and
`await`s `searchParams` before any data call. This is mandatory — omitting
it causes the URL filter state to be silently ignored.

## Chart conventions

- Recharts components are wrapped behind `components/sessions/charts/_lazy.tsx`
  (via `next/dynamic({ ssr: false })`). Import from `_lazy` in pages, not
  from the concrete chart files.
- Charts that do not use Recharts (sparkline, activity-heatmap,
  token-breakdown-bars, streak-card, etc.) import directly — they carry no
  bundle-size penalty.
- Grid/axis colors: `rgb(var(--color-line))` and `rgb(var(--color-muted))`.
  No hard-coded Tailwind palette values inside chart files.

## Empty and error states

Every route handles three states:
1. `unconfigured` — `CLAUDE_CONTROL_PLANE_DATA_ROOT` is not set and the
   `~/.claude/projects` fallback does not exist. Render `<EmptyState>` with
   configuration guidance.
2. `error` — data root is configured but an I/O or parse error occurred.
   Render `<ErrorState>` with the message.
3. `empty` — configured and readable, but no data yet. Render `<EmptyState>`
   with a neutral "no data yet" description.

Do not fabricate placeholder values or mock rows for any of these cases.

## Deliberately out of scope (Phase 1)

Do **not** add any of the following until the next planned slice:

- CRUD operations on sessions (delete, rename, tag).
- Real-time session streaming or live tail.
- Export/import in formats other than the existing HTML export.
- MCP usage analytics that cross-reference the MCP module.
- Multi-workspace or remote data roots.
- Session comparison or diff views.

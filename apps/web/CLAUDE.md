# apps/web — Index

## Responsibility
- The dashboard shell: Next.js 15 App Router, routes for every module, sidebar/topbar layout, theme, and local API endpoints.
- Thin orchestration only. Domain logic belongs in `packages/core`; real ingestion belongs in adapters. This app composes and renders them.
- Rationale: [ADR-0001](../../docs/architecture/decisions/0001-phase-1-skeleton.md) (shell-first delivery), [ADR-0002](../../docs/architecture/decisions/0002-agent-agnostic-core.md) (no vendor branching in UI).

## Read First
- `app/layout.tsx` — root layout, theme script, shell.
- `app/page.tsx` — overview route.
- `lib/modules.ts` — central module registry. Single source of truth for each module's `label`, `href`, `icon`, `status`, `phase` (`skeleton` | `active` | `deferred`), `owner`, and `docs` pointer. Every sidebar entry, placeholder route, and module-level status signal flows from this list.
- `types/control-plane.ts` — UI-side types (status enums, `ModuleDefinition`, `ModulePhase`, etc.).
- `app/agents/AGENTS.md` — authoritative local contract for the agents module; mirror its pattern for new module slices.

## Local Structure
- `app/<module>/page.tsx` — one route per module. Currently most are placeholder/empty-state renderings.
- `app/api/events/route.ts` — SSE stream (no-op placeholder, do not fabricate events here).
- `app/api/health/route.ts` — health probe.
- `components/layout/` — `AppShell`, `Sidebar`, `Topbar`, `PageHeader`, `ModulePage` — reuse these for any new module page.
- `components/ui/` — primitives: `Button`, `Badge`, `DataTable`, `Icon`, `MetricCard`, `State` (empty/error/loading).
- `components/<module>/` — module-specific presentational components. Keep these client-safe; data lives in `lib/`.
- `components/theme/` — theme toggle + inline theme script (runs before hydration to avoid flash).
- `lib/<module>-source.ts` — server-only data derivation for a module (has `*.test.ts` siblings).
- `lib/control-plane-state.ts`, `lib/format.ts`, `lib/utils.ts` — shared helpers.

## Entry Points / Flow
- Route render: `app/<module>/page.tsx` (server component) → calls `lib/<module>-source.ts` → returns canonical data from `@control-plane/core` → passes as props to `components/<module>/*`.
- Sidebar: `components/layout/Sidebar` reads `lib/modules.ts`. Active route resolves via `getModuleByHref(pathname)`.
- `/agents/[id]` and `/sessions/[id]` expect `encodeURIComponent`'d ids in URLs and decode on the server.

## Dependencies
- Consumes: `@control-plane/core` (types + contracts), `@control-plane/adapter-claude-code` (read-only JSONL source), `yaml`.
- Not yet wired: `@control-plane/events`, `@control-plane/storage` — available but not imported by UI modules in Phase 1.

## New Module Checklist
When adding a module slice, all five must land together or the sidebar/e2e drifts:
1. Add the entry to `lib/modules.ts` (`label`, `href`, `icon`, `status`, `phase`, `owner`, `docs`).
2. Create `app/<module>/page.tsx` (server component).
3. Create `lib/<module>-source.ts` (+ `*.test.ts`) returning canonical `@control-plane/core` shapes.
4. Create `components/<module>/` with client-safe presentational atoms.
5. Add the route + empty-state copy to `MODULE_ROUTES` in `../../e2e/dashboard-shell.spec.ts`.

## Local Conventions
- **Canonical types only in the rendered tree.** Never import adapter- or vendor-specific shapes into components.
- **Server vs client split.** `node:fs`, adapter calls, and secrets stay in `page.tsx` and `lib/*`. Components under `components/` should work with plain serializable props.
- **No fabricated data.** When a source is empty, render `components/ui/State` empty/error variants.
- **Path alias.** `@/*` resolves from `apps/web/` (see `tsconfig.json`). Prefer it over long relative paths.
- **Styling.** Tailwind-first. Tailwind config is per-app (`tailwind.config.ts`). Theme tokens go through `components/theme/`.
- **Tests.** Co-locate Vitest specs next to the module (`lib/*.test.ts`). E2E specs live in the repo-level `e2e/`, not here.
- **Dev server.** Must stay bound to `127.0.0.1:3000` — Playwright `global-setup` depends on it.

## Sharp Edges
- `predev`/`prebuild` scripts rm `.next/` to avoid stale route manifest issues after module registry edits. Don't remove them lightly.
- The SSE endpoint (`app/api/events/route.ts`) is inert: it emits only a `retry:` hint and an empty-stream comment, then closes. Do not fabricate `data:` frames here — if you need visual data for rendering work, do it in a test fixture, not in the shipped route.
- Changing `lib/modules.ts` changes every route placeholder simultaneously. New modules must add a matching `app/<key>/page.tsx`, or the sidebar link 404s. When adding a module, set `phase` honestly (`skeleton` for placeholder, `active` for real data, `deferred` for not-yet-started) and point `docs` at the module's spec in `docs/modules/`.
- The `app/agents/` subtree has its own binding contract in `AGENTS.md` that narrows this guidance further — follow it for anything under `/agents`.
- The `app/skills/` subtree has its own `CLAUDE.md` covering the usage + efficacy data layers, the `SkillGridItem` prop-stripping requirement, and the session-outcome heuristic — follow it for anything under `/skills`.
- The `app/sessions/` subtree has its own `CLAUDE.md` covering the sub-nav layout, analytics capability wiring, `DateRangePicker` / `date-range.ts` split, and the Recharts lazy-loading convention — follow it for anything under `/sessions`.

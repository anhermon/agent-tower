# Modular Agents Control Plane — Index

## Purpose
- Local-first dashboard for managing, observing, and analyzing multiple AI agent harnesses through a shared control-plane model.
- Phase 1 is skeleton only: reusable UI shell, canonical domain types, adapter contracts, mock/empty flows. Real ingestion, CRUD, and runtime control are **explicitly deferred**.

## Stack
- TypeScript (ES modules), Node 22+, pnpm 10 workspaces.
- Next.js 15 App Router + React 19 + Tailwind 3 for the dashboard (`apps/web`).
- Vitest for unit tests, Playwright for E2E smoke tests.
- No backend runtime yet — all data is in-memory or read from local JSONL via the Claude Code adapter.

## Commands
- `pnpm install` — bootstrap workspaces.
- `pnpm dev` — run `@control-plane/web` on `127.0.0.1:3000` (cleans `.next` first).
- `pnpm typecheck` — TS across all workspaces (this is also what `pnpm lint` runs).
- `pnpm test` — Vitest unit tests, all workspaces.
- `pnpm test:e2e` — Playwright smoke tests (starts dev server automatically).
- `task verify` — typecheck + unit tests, the local "ready-to-commit" gate.

## Architecture Map
- `apps/web` — Next.js App Router dashboard, routes, module registry, local API endpoints.
- `packages/core` — canonical domain types and capability-based adapter contracts. No runtime deps.
- `packages/events` — typed event bus and append-only event log abstractions + mock stream.
- `packages/storage` — repository interfaces and Phase 1 in-memory storage.
- `packages/adapter-claude-code` — first real adapter: read-only JSONL → canonical types.
- `packages/testing` — shared fixtures (currently `core` fixtures only).
- `docs/architecture` — durable decisions (overview, adapter contracts, data model, security).
- `docs/architecture/decisions` — ADR log. The **why** behind the rules in this file; see `decisions/README.md` for the template and index.
- `docs/modules` — per-module product/UX specs (agents, sessions, webhooks, kanban, skills, mcps, channels, replay).
- `e2e` — Playwright specs at the repo root, not nested in the web app.

## Entry Points
- `apps/web/app/layout.tsx` + `apps/web/app/page.tsx` — shell and overview route.
- `apps/web/lib/modules.ts` — module registry: single source of truth for each module's status, delivery `phase`, owner, and spec-doc pointer. Drives the sidebar, route headers, and module-level state signals.
- `apps/web/app/api/events/route.ts` — SSE endpoint (currently a no-op stream).
- `apps/web/app/api/health/route.ts` — health probe.
- `packages/core/src/index.ts` — re-exports canonical domain + contracts.
- `packages/adapter-claude-code/src/adapter.ts` — `ClaudeCodeSessionSource`.

## Change Guidance
- **Agent-agnostic at the boundary.** UI and services consume `@control-plane/core` types. Never branch on vendor names; use `descriptor.runtime` and capability checks. Rationale: [ADR-0002](docs/architecture/decisions/0002-agent-agnostic-core.md).
- **Keep modules isolated.** New features live in a single `app/<module>` directory + a matching `lib/<module>-source.ts` + a `components/<module>/` subtree. Cross-module imports should be one-directional and minimal.
- **Server-only filesystem access.** Only server components and server modules may touch `node:fs` or adapters. Client components receive plain data via props.
- **No fabricated data.** When a data source is empty, render the empty/error state — do not seed mock data inside UI modules.
- **Before declaring done:** run `pnpm typecheck` and `pnpm test`. For UI changes also run `pnpm test:e2e` or verify in a browser.
- **Do not** wire real ingestion, persistence, CRUD, or runtime control in Phase 1 — that scope is listed as deferred in `docs/architecture/overview.md` and the per-module docs. Rationale: [ADR-0001](docs/architecture/decisions/0001-phase-1-skeleton.md), [ADR-0003](docs/architecture/decisions/0003-local-first-storage.md).
- Session notes belong in `.claude/` (gitignored). `NOTES.md`, `TODO.md`, `PLAN.md`, `SCRATCH.md` at the repo root are also gitignored — use them for temporal docs, never commit.

## Subtree Guides
- [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md) — dashboard shell, routing, module UI conventions.
- [`packages/core/CLAUDE.md`](packages/core/CLAUDE.md) — canonical domain + adapter contracts.
- [`packages/events/CLAUDE.md`](packages/events/CLAUDE.md) — event bus + append-only log.
- [`packages/storage/CLAUDE.md`](packages/storage/CLAUDE.md) — repository interfaces + in-memory impl.
- [`packages/adapter-claude-code/CLAUDE.md`](packages/adapter-claude-code/CLAUDE.md) — Claude Code JSONL source adapter. See also `packages/adapter-claude-code/AGENTS.md` for the canonical mapping table.
- [`packages/testing/CLAUDE.md`](packages/testing/CLAUDE.md) — shared fixtures.
- [`e2e/CLAUDE.md`](e2e/CLAUDE.md) — Playwright smoke suite, fixture roots, empty-state baseline.

## Sharp Edges
- `AGENTS.md` files (root + `packages/adapter-claude-code/` + `apps/web/app/agents/` + `apps/web/app/webhooks/`) are human-authored and authoritative for their scope. When they conflict with a `CLAUDE.md`, the local `AGENTS.md` wins for its subtree.
- `apps/web` runs with `next dev --hostname 127.0.0.1`. Playwright `global-setup` assumes that host; don't change it casually.
- Workspace packages publish from `dist/` (built via `tsc -p`). If types look stale when iterating, run `pnpm -r build` or `pnpm typecheck` in the dependent package.
- `packages/testing` exports **source** (`./fixtures/core/index.ts`), not a build artifact — importers get raw TS.

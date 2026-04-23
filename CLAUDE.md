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
- `pnpm typecheck` — TS across all workspaces.
- `pnpm test` — Vitest unit tests, all workspaces.
- `pnpm test:e2e` — Playwright smoke tests (starts dev server automatically).
- `task verify` — typecheck + unit tests, the local "ready-to-commit" gate.
- **CI tiers** (see `docs/superpowers/specs/2026-04-23-ci-quality-gates-design.md`):
  - `task ci:fast` — T2: lint + types + unit+coverage + build + audit. Pre-push gate.
  - `task ci` — T3: full correctness + perf + security + cleanliness. Project-healthy gate.
  - `task ci:security` / `ci:perf` — T3 subsets.
  - `task ci:nightly` — T4: full E2E + visual + osv-scanner + semgrep + stryker + outdated.
  - `task ci:health` — one-line green/red board from `.ci/reports/latest.json`.

## Architecture Map
- `apps/web` — Next.js App Router dashboard, routes, module registry, local API endpoints.
- `packages/core` — canonical domain types and capability-based adapter contracts. No runtime deps.
- `packages/events` — typed event bus and append-only event log abstractions + mock stream.
- `packages/storage` — repository interfaces and Phase 1 in-memory storage.
- `packages/adapter-claude-code` — first real adapter: read-only JSONL → canonical types; also hosts shared skill-manifest discovery and skill usage/efficacy analytics reused by the web app, the CLI, and the MCP server.
- `packages/cli` — `cp` binary exposing the same read-only analytics surface to shells and scripts. Imports the adapter directly.
- `packages/mcp-server` — stdio MCP server (`control-plane-mcp`) wrapping the same analytics as typed MCP tools. Launched via `.mcp.json`.
- `packages/testing` — shared fixtures (currently `core` fixtures only).
- `docs/architecture` — durable decisions (overview, adapter contracts, data model, security).
- `docs/architecture/decisions` — ADR log. The **why** behind the rules in this file; see `decisions/README.md` for the template and index.
- `docs/modules` — per-module product/UX specs (agents, sessions, webhooks, kanban, skills, mcps, channels, replay).
- `docs/superpowers/specs` — implementation design specs (CI tiers, etc.).
- `docs/perf` — baseline, improvement map, and after-reports for perf work.
- `docs/testing` — test strategy (layers, TDD/BDD split, coverage bars).
- `scripts/ci` — per-tool CI wrappers; report contract + aggregator.
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

## Agent Interaction Surfaces
Three surfaces let an LLM agent inspect control-plane data without navigating source:
- **Project skill** — `.claude/skills/control-plane-inspect/SKILL.md` maps natural-language questions ("highest-token sessions?", "skills with negative delta?") to concrete commands. Claude Code loads it automatically when working inside this repo. The `.claude/` tree is gitignored by default; if you want the skill version-controlled, add `!/.claude/skills/` to `.gitignore`.
- **CLI** — `packages/cli` ships the `cp` binary with read-only subcommands: `cp health`, `cp sessions top|show`, `cp skills top|usage|efficacy`, `cp agents list`. JSON output by default, `--pretty` for humans. Build once with `pnpm --filter @control-plane/cli build`, then run via `node packages/cli/dist/cli.js <subcommand>` from the repo root (or `pnpm link --global` inside the package for `$PATH` access).
- **MCP server** — `packages/mcp-server` ships `control-plane-mcp` (stdio MCP, 7 tools: `control_plane_health`, `sessions_top`, `sessions_show`, `skills_top`, `skills_usage`, `skills_efficacy`, `agents_list`). Registered at repo root via `.mcp.json`; requires `pnpm --filter @control-plane/mcp-server build` once before first use. All tools are read-only and never throw — errors surface as `{ok:false, reason, message?}`.

Data surface for all three: `CLAUDE_CONTROL_PLANE_DATA_ROOT` (env) → `~/.claude/projects` fallback → unconfigured. Skill-manifest discovery uses `CONTROL_PLANE_SKILLS_ROOTS` (env) → `~/.claude/skills` fallback.

## Subtree Guides
- [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md) — dashboard shell, routing, module UI conventions.
- [`packages/core/CLAUDE.md`](packages/core/CLAUDE.md) — canonical domain + adapter contracts.
- [`packages/events/CLAUDE.md`](packages/events/CLAUDE.md) — event bus + append-only log.
- [`packages/storage/CLAUDE.md`](packages/storage/CLAUDE.md) — repository interfaces + in-memory impl.
- [`packages/adapter-claude-code/CLAUDE.md`](packages/adapter-claude-code/CLAUDE.md) — Claude Code JSONL source adapter. See also `packages/adapter-claude-code/AGENTS.md` for the canonical mapping table.
- [`packages/cli/CLAUDE.md`](packages/cli/CLAUDE.md) — `cp` read-only analytics CLI.
- [`packages/mcp-server/CLAUDE.md`](packages/mcp-server/CLAUDE.md) — stdio MCP server wrapping the same analytics.
- [`packages/testing/CLAUDE.md`](packages/testing/CLAUDE.md) — shared fixtures.
- [`scripts/ci/CLAUDE.md`](scripts/ci/CLAUDE.md) — per-tool CI wrappers + report contract.
- [`e2e/CLAUDE.md`](e2e/CLAUDE.md) — Playwright smoke suite, fixture roots, empty-state baseline.

## Sharp Edges
- `AGENTS.md` files (root + `packages/adapter-claude-code/` + `apps/web/app/agents/` + `apps/web/app/webhooks/`) are human-authored and authoritative for their scope. When they conflict with a `CLAUDE.md`, the local `AGENTS.md` wins for its subtree.
- `apps/web` runs with `next dev --hostname 127.0.0.1`. Playwright `global-setup` assumes that host; don't change it casually.
- Workspace packages publish from `dist/` (built via `tsc -p`). If types look stale when iterating, run `pnpm -r build` or `pnpm typecheck` in the dependent package.
- `packages/testing` exports **source** (`./fixtures/core/index.ts`), not a build artifact — importers get raw TS.

# Modular Agents Control Plane — Index

## Purpose
- Local-first dashboard for managing, observing, and analyzing multiple AI agent harnesses through a shared control-plane model.
- Phase 1 (complete): dashboard shell, canonical domain types, adapter contracts, in-memory event bus and storage, read-only Claude Code JSONL adapter.
- Phase 2 (in progress): Sessions analytics (5 sub-routes, search, export), Agents inventory, Skills manifests + usage telemetry + efficacy, Webhooks inbound receiver + workflow engine, Kanban read-only board, CLI (`cp`), and MCP server (9 tools).
- Still deferred: MCPs module UI, Channels module, Replay module UI, webhook CRUD persistence, live process control, multi-user auth, persistent storage backends.

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
- `task github:webhook:create` — create/update the GitHub repository webhook for `/api/webhooks/github` using `CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_URL` and `CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_SECRET`.
- `task github:branch-protect` — apply the GitHub `main` branch rules after the remote exists.
- `task agent:preflight` — pre-commit ritual: autofix fmt+lint (`task fmt` + `pnpm eslint --fix`), then typecheck + test. Run before every commit.
- `task agent:worktree-new -- <branch>` — create a git worktree in `.worktrees/<branch>` + run baseline verify.
- `task agent:worktree-rm -- <branch>` — remove a git worktree after work is merged or discarded.
- `task agent:pr-merge` — wait for GitHub Actions CI to pass on the current branch's PR, then squash-merge and watch post-merge CI. Use this for ALL merges. Never use `gh pr merge --admin`.

## Architecture Map
- `apps/web` — Next.js App Router dashboard, routes, module registry, local API endpoints.
- `packages/core` — canonical domain types and capability-based adapter contracts. No runtime deps.
- `packages/events` — typed event bus and append-only event log abstractions + mock stream.
- `packages/storage` — repository interfaces and Phase 1 in-memory storage.
- `packages/adapter-claude-code` — first real adapter: read-only JSONL → canonical types; also hosts shared skill-manifest discovery, skill usage/efficacy/hygiene analytics, and per-turn timeline + skill-attribution analytics reused by the web app, the CLI, and the MCP server.
- `packages/cli` — `cp` binary exposing the same read-only analytics surface to shells and scripts. Imports the adapter directly.
- `packages/mcp-server` — stdio MCP server (`control-plane-mcp`) wrapping the same analytics as typed MCP tools. Launched via `.mcp.json`.
- `packages/logger` — pino-backed structured logger shared across apps/packages. Env-driven config; fans out to `logs/{stdout,stderr,requests}.log` and a colored TTY stream.
- `packages/testing` — shared fixtures (currently `core` fixtures only).
- `docs/architecture` — durable decisions (overview, adapter contracts, data model, security).
- `docs/architecture/decisions` — ADR log. The **why** behind the rules in this file; see `decisions/README.md` for the template and index.
- `docs/modules` — per-module product/UX specs (agents, sessions, webhooks, kanban, skills, mcps, channels, replay).
- `docs/superpowers/specs` — implementation design specs (CI tiers, etc.).
- `docs/perf` — baseline, improvement map, and after-reports for perf work.
- `docs/testing` — test strategy (layers, TDD/BDD split, coverage bars).
- `scripts/ci` — per-tool CI wrappers; report contract + aggregator.
- `.github/workflows` — GitHub Actions wrappers around the same Taskfile gates used locally.
- `e2e` — Playwright specs at the repo root, not nested in the web app.

## Entry Points
- `apps/web/app/layout.tsx` + `apps/web/app/page.tsx` — shell and overview route.
- `apps/web/lib/modules.ts` — module registry: single source of truth for each module's status, delivery `phase`, owner, and spec-doc pointer. Drives the sidebar, route headers, and module-level state signals.
- `apps/web/app/api/events/route.ts` — SSE endpoint with real `fs.watch` on the data root; emits `session-created` / `session-appended` events.
- `apps/web/app/api/webhooks/github/route.ts` — inbound GitHub webhook receiver; validates GitHub headers/signature and appends accepted deliveries to the local webhook event log.
- `apps/web/app/api/health/route.ts` — health probe.
- `packages/core/src/index.ts` — re-exports canonical domain + contracts.
- `packages/adapter-claude-code/src/adapter.ts` — `ClaudeCodeSessionSource`.

## GitHub Development Workflow
- Use GitHub as the shared integration surface. Local work happens on feature branches, not `main`; branch names should be explicit (`feat/<scope>`, `fix/<scope>`, `ci/<scope>`, or `agent/<scope>`).
- Open a PR for every branch. PR descriptions should name the changed module, commands run, and any intentionally skipped checks.
- `main` is protected once the remote exists: require PRs, require at least one review, require the GitHub Actions fast CI gate, and keep branch history linear through squash merges.
- Run `task github:branch-protect` after the first push to apply those rules through the GitHub API.
- GitHub Actions must call Taskfile targets (`task ci:fast`, `task ci`, `task ci:nightly`) instead of re-implementing local commands in YAML.
- Agents working from GitHub events should read the PR timeline first, address review comments directly, and leave a concise comment with the exact validation commands they ran.
- Do not push directly to `main` after the initial repository bootstrap. Use `gh pr create`, `gh pr checks`, and `gh pr merge --squash` when operating from the CLI.
- The inbound repository webhook targets `POST /api/webhooks/github`. Configure it with a public HTTPS callback URL and `CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_SECRET`; use `task github:webhook:create` after `origin` points at the GitHub repo.

## Agent Coding Workflow

These rules apply whenever an agent (including sub-agents) starts implementation work. Evidence from session history shows agents fighting CI reactively instead of leveraging it proactively — these rules fix that.

### a. Always start in a git worktree

Never implement directly on the main working tree or on `main`. Before writing any code:
```
git worktree add .worktrees/<branch> -b <branch>
# or the shortcut:
task agent:worktree-new -- feat/<scope>
```
`task agent:worktree-new` creates the worktree, installs deps, and runs a baseline `task verify` to confirm the starting state is clean. Worktrees go in `.worktrees/` (gitignored). **Invoke `superpowers:using-git-worktrees` before writing any code** — it contains the full worktree protocol and must be used, not just referenced.

### b. Pre-commit ritual — autofix before every commit

Before staging and committing, always run:
```
task agent:preflight
```
This runs in order: `task fmt` (Biome autofix, ~0.2s) → `task build:packages` (so ESLint resolves `@control-plane/*` types) → `pnpm eslint . --fix` → `pnpm typecheck` → `pnpm test`. It autofixes ~90% of T1/T2 violations before the hooks see them.

**Gotcha — `packages/*` edits:** ESLint resolves `@control-plane/*` imports from built `.d.ts` files. If you modify any `packages/` directory and skip `task build:packages`, ESLint reports thousands of false "type not found" errors. `agent:preflight` handles this automatically.

**Commit and push after every logical unit.** One fix, one component, one plan step = one commit, then push immediately. Do not accumulate commits locally. Push as soon as a unit is complete so CI runs early and failures surface fast. Aim for ≤15 minutes between pushes.

**After every push, check the PR is conflict-free:**
```
task agent:pr-ready
```
This checks `gh pr view --json mergeable` and fails immediately if the PR has conflicts (`CONFLICTING`/`DIRTY`). If it fails, rebase before doing anything else:
```
git fetch origin main && git rebase origin/main
# resolve any conflicts
git push --force-with-lease
```
A PR with conflicts is not done. Do not declare done, do not wait for CI — fix the conflicts first.

### c. Never bypass red CI

- Never pass `--no-verify` to `git commit` or `git push`. If a T1 hook (Biome + ESLint + gitleaks) or T2 hook (`task ci:fast`) fails, fix the underlying issue — not the hook.
- `task ci:fast` runs automatically on every `git push` (lefthook pre-push). If it fails, stop and fix before pushing more commits.
- **Local passing ≠ CI green.** `pnpm test` passing locally means nothing until GitHub Actions completes. Never declare a task done based on local results alone.
- Never use `git checkout --detach HEAD` before a push. The pre-push hook runs `task ci:fast` unconditionally regardless of HEAD state, and the `ci-enforce.sh` Bash hook blocks it. Check out the branch directly.

### d. Merging PRs — always gate on conflicts and CI

- Run `task agent:pr-ready` after every push and before declaring a task done. It exits non-zero if the PR has conflicts or non-passing checks.
- Use `task agent:pr-merge` for all PR merges. It checks conflicts first, then calls `gh pr checks --watch`, then squash-merges, then watches post-merge CI on main.
- **Never** use `gh pr merge --admin`. The `--admin` flag bypasses the required-status-check branch protection gate. It is blocked by the `ci-enforce.sh` hook.
- **PR has conflicts = not done.** Rebase onto `origin/main`, resolve, force-push, verify `task agent:pr-ready` passes.
- After merge, stay alive until `task agent:pr-merge` exits with status 0 — that means the post-merge CI run on main also passed. A green local merge with red main CI is still a broken repo.

### d. Monitor workflow health

Run `cp workflow-health --pretty` periodically to check whether workflow discipline is improving:

```
pnpm cp workflow-health --pretty --limit 10
```

This shows a weighted score (recent sessions count more), baseline-vs-recent delta, and top issues (e.g., bash dominance, single-tool turns, context bloat). Use it to verify that applied fixes are working and to identify new regressions. Invoke `superpowers:workflow-health` for the full analysis protocol.
- If GitHub Actions CI is red, do not open a PR, do not merge, do not stack commits on top of a failing gate. Fix forward.
- Semantic ESLint violations (import cycles, cognitive complexity >25, missing hook deps) are not autofixable — they require code changes. Don't suppress with `eslint-disable`; fix the structure.

## Observability
- Every server process uses `@control-plane/logger` — `getLogger(component).info({...}, "msg")`. Never `new pino()` directly, never `console.log`.
- `apps/web` bootstraps the logger in `instrumentation.ts`; every API route is wrapped with `apps/web/lib/with-audit.ts` so requests are audited to `logs/requests.log` with a propagated `x-request-id`.
- `task dev` forces `LOG_PRETTY=1 LOG_FILES=1 LOG_REQUESTS=1 LOG_LEVEL=debug`. Plain `pnpm dev` relies on the same defaults when stdout is a TTY. Log files live under `apps/web/logs/` (gitignored).

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
- **Project skill** — `.claude/skills/control-plane-inspect/SKILL.md` maps natural-language questions ("audit my sessions", "highest-token sessions?", "cache thrash?", "skills with negative delta?") to concrete commands. Claude Code loads it automatically when working inside this repo. The `.claude/` tree is gitignored by default; if you want the skill version-controlled, add `!/.claude/skills/` to `.gitignore`.
- **CLI** — `packages/cli` ships the `cp` binary with read-only subcommands: `cp health`, `cp audit`, `cp sessions top|show|waste`, `cp skills top|usage|efficacy|housekeep`, `cp agents list`. JSON output by default, `--pretty` for humans. Build once with `pnpm --filter @control-plane/cli build`, then run via `node packages/cli/dist/cli.js <subcommand>` from the repo root (or `pnpm link --global` inside the package for `$PATH` access). **`cp audit` is the holistic one-shot** — any "analyze my sessions" / "efficiency audit" question should start there; it bundles top-by-cost, top-by-waste-score, corpus waste aggregates, cold-giant skills, and negative-efficacy skills in one report. `cp sessions show <id> --timeline` attaches per-turn tool/token rollup and skill attribution. `cp skills housekeep` (dry-run by default; `--apply` archives dead-weight skills).
- **MCP server** — `packages/mcp-server` ships `control-plane-mcp` (stdio MCP, 9 tools: `control_plane_health`, `control_plane_audit`, `sessions_top`, `sessions_show`, `sessions_waste`, `skills_top`, `skills_usage`, `skills_efficacy`, `agents_list`). Registered at repo root via `.mcp.json`; requires `pnpm --filter @control-plane/mcp-server build` once before first use. All tools are read-only and never throw — errors surface as `{ok:false, reason, message?}`.

Data surface for all three: `CLAUDE_CONTROL_PLANE_DATA_ROOT` (env) → `~/.claude/projects` fallback → unconfigured. Skill-manifest discovery uses `CONTROL_PLANE_SKILLS_ROOTS` (env) → `~/.claude/skills` fallback.

## Subtree Guides
- [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md) — dashboard shell, routing, module UI conventions.
- [`packages/core/CLAUDE.md`](packages/core/CLAUDE.md) — canonical domain + adapter contracts.
- [`packages/events/CLAUDE.md`](packages/events/CLAUDE.md) — event bus + append-only log.
- [`packages/storage/CLAUDE.md`](packages/storage/CLAUDE.md) — repository interfaces + in-memory impl.
- [`packages/adapter-claude-code/CLAUDE.md`](packages/adapter-claude-code/CLAUDE.md) — Claude Code JSONL source adapter. See also `packages/adapter-claude-code/AGENTS.md` for the canonical mapping table.
- [`packages/cli/CLAUDE.md`](packages/cli/CLAUDE.md) — `cp` read-only analytics CLI.
- [`packages/mcp-server/CLAUDE.md`](packages/mcp-server/CLAUDE.md) — stdio MCP server wrapping the same analytics.
- [`packages/logger/CLAUDE.md`](packages/logger/CLAUDE.md) — structured logger, fanout streams, env flags (`LOG_LEVEL`/`LOG_PRETTY`/`LOG_FILES`/`LOG_REQUESTS`/`LOG_DIR`/`LOG_SERVICE`).
- [`packages/testing/CLAUDE.md`](packages/testing/CLAUDE.md) — shared fixtures.
- [`scripts/ci/CLAUDE.md`](scripts/ci/CLAUDE.md) — per-tool CI wrappers + report contract.
- [`e2e/CLAUDE.md`](e2e/CLAUDE.md) — Playwright smoke suite, fixture roots, empty-state baseline.

## Sharp Edges
- `AGENTS.md` files (root + `packages/adapter-claude-code/` + `apps/web/app/agents/` + `apps/web/app/webhooks/`) are human-authored and authoritative for their scope. When they conflict with a `CLAUDE.md`, the local `AGENTS.md` wins for its subtree.
- `apps/web` runs with `next dev --hostname 127.0.0.1`. Playwright `global-setup` assumes that host; don't change it casually.
- Workspace packages publish from `dist/` (built via `tsc -p`). If types look stale when iterating, run `pnpm -r build` or `pnpm typecheck` in the dependent package.
- `packages/testing` exports **source** (`./fixtures/core/index.ts`), not a build artifact — importers get raw TS.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

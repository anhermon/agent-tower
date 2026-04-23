# e2e — Index

## Responsibility
- Playwright smoke suite for the dashboard. Lives at the repo root, not under `apps/web/`, because it drives the app as an external black box.
- Covers the shell (`dashboard-shell.spec.ts`), data-backed modules (`agents-data.spec.ts`, `sessions-data.spec.ts`, `skills-data.spec.ts`), and sessions features (`sessions.spec.ts`, `sessions-analytics.spec.ts`, `sessions-search.spec.ts`, `sessions-live.spec.ts`).
- **Perf coverage** (`perf-coverage.perf.spec.ts`, Playwright project `perf`): scrolls each LHCI URL and runs light interactions so lazy charts and dialogs mount. Run `pnpm test:e2e:perf` or `task test:e2e:perf`; use `TEST_SERVER_PORT=3100` with `task test-server:up` to mirror `lighthouserc.perf.json`. See `docs/perf/TIERS.md` and `docs/perf/coverage-matrix.md`.
- Rationale: [ADR-0001](../docs/architecture/decisions/0001-phase-1-skeleton.md) (smoke-level coverage for the skeleton phase).

## Read First
- `../playwright.config.ts` — `baseURL`, `webServer` command (`pnpm dev`), fixture-root env vars, `workers: 1`, projects (`chromium`, `mobile`).
- `global-setup.ts` — re-creates `SESSIONS_FIXTURE_ROOT` and `SKILLS_FIXTURE_ROOT` empty before the dev server boots. Exports the canonical paths used by specs.
- `dashboard-shell.spec.ts` — the authoritative empty-state baseline: every module's empty copy is asserted here.

## Local Conventions
- **Fixture roots live under `test-results/`** (`e2e-claude-fixture`, `e2e-skills-fixture`) and are wired into the dev server via `CLAUDE_CONTROL_PLANE_DATA_ROOT` / `CONTROL_PLANE_SKILLS_ROOTS`. Always use the constants from `global-setup.ts` or `playwright.config.ts`; never hardcode them a second time.
- **Serial execution.** `workers: 1` + `test.describe.configure({ mode: "serial" })` in data specs is required — specs share on-disk fixtures with the running dev server.
- **Seed in `beforeAll`, remove in `afterAll`.** Data specs must leave the fixture root empty so `dashboard-shell.spec.ts` (empty-state baseline) stays deterministic when run after them.
- **Host pin.** The dev server binds `127.0.0.1:3000`. Do not switch to `localhost` or change the port — config and `apps/web` dev script depend on this exact URL.
- **Test naming.** Shell spec uses `given_..__when_..__then_..` snake-case names; mirror that style for new BDD-shaped cases.

## Sharp Edges
- `reuseExistingServer: true` means a stale `pnpm dev` from another terminal will satisfy Playwright's readiness check — but it won't have the fixture-root env vars set, so data specs will fail mysteriously. Kill any running dev server before invoking `pnpm test:e2e`.
- Playwright's managed `webServer` sets `CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE` and `CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_DELIVERIES_FILE` to empty strings so `apps/web/.env.local` cannot change empty-state baselines (for example `dashboard-shell.spec.ts`).
- Adding a new data-backed module spec requires adding its empty-state copy to `dashboard-shell.spec.ts`'s `MODULE_ROUTES` list, or the shell baseline will drift from reality.
- Fixture directory names must be subproject-shaped for the Claude Code adapter (e.g., `-Users-e2e-agents-sample`). See `packages/adapter-claude-code/AGENTS.md` for why.

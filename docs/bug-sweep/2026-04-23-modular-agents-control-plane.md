# Bug sweep — Modular Agents Control Plane — 2026-04-23

## Expectations (from docs)

- **Phase 1 skeleton**: Dashboard shell, canonical domain types, read-only Claude Code adapter, empty/error states without fabricated data ([`docs/architecture/overview.md`](../architecture/overview.md), [ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md)).
- **Local runs**: `pnpm dev` (dashboard), `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` ([`README.md`](../../README.md), root [`CLAUDE.md`](../../CLAUDE.md)).
- **E2E**: Fixture roots under `test-results/`, serial worker, host `127.0.0.1:3000`; `dashboard-shell.spec.ts` is the empty-state baseline ([`e2e/CLAUDE.md`](../../e2e/CLAUDE.md)).
- **Invariants**: Agent-agnostic UI; server-only FS; no mock rows when sources are empty.

## Personas exercised

1. **New operator** — First visit: open `/`, toggle theme, open each module from sidebar, expect empty states and no tables on skeleton routes.
2. **Power user** — Sessions sub-nav, search/export (not deep-tested this pass); CLI `cp health` / `cp audit` implied by docs.
3. **Skeptical reviewer** — Empty vs configured states, env-driven copy, no phantom data; a11y scans on canonical routes.
4. **Integrator** — `CLAUDE_CONTROL_PLANE_DATA_ROOT`, webhooks file env, GitHub webhook route; concern that local `.env.local` must not break CI baselines.

**Concrete actions (per persona)**  
Install → `pnpm dev` → browse `/`, `/sessions`, `/webhooks`, `/agents`, `/skills`, `/mcps`, `/channels`, `/replay` → theme toggle → run `pnpm typecheck` + `pnpm test` + `pnpm test:e2e` → adversarial: stale server on :3000, inherited env from `.env.local`.

## Findings

| ID | Severity | Area | Persona / steps | Expected | Actual | Evidence |
|----|----------|------|-------------------|----------|--------|----------|
| F1 | P2 | E2E | New operator: `dashboard-shell` module loop | Empty-state copy matches UI | `MODULE_ROUTES` used wrong strings for `/sessions`, `/mcps`, `/channels`, `/replay` | `e2e/dashboard-shell.spec.ts`; UI: `apps/web/app/sessions/page.tsx`, `apps/web/app/mcps/page.tsx`, etc. |
| F2 | P1 | E2E / env | Integrator + local dev | Empty baseline matches unconfigured webhooks | `apps/web/.env.local` pointed webhooks at repo JSON; Playwright dev server showed configured subscriptions, not empty state | Playwright `error-context.md` showed `source file: …/.claude/webhook-subscriptions.json` and subscription table |
| F3 | P2 | E2E ops | Skeptical: full `pnpm test:e2e` after partial run | Stable server for 144 tests | Stale `reuseExistingServer` + wedged `next dev` led to widespread 30s timeouts | Terminal log: cascaded failures after early a11y/agents specs; `curl` to :3000 hung |
| F4 | P3 | Docs | Reader | CONTRIBUTING entrypoint | No `CONTRIBUTING.md` (only mentioned in skill template) | Glob: file missing |
| F5 | P3 | Docs | Reader | Single story for “Claude ingestion” | [`docs/architecture/overview.md`](../architecture/overview.md) says Phase 1 does not include “real Claude Code ingestion” while ADR/README describe read-only JSONL adapter | Wording ambiguity only — clarify “pipeline/CRUD” vs “read-only scan” if desired |

## Doc drift

- **README vs reality**: README stays high-level; root `CLAUDE.md` is richer (CLI, MCP, Taskfile) — acceptable, not a bug.
- **Overview “no ingestion” vs adapter**: Adapter reads local JSONL; treat as doc precision issue (F5), not product contradiction.

## Fix plan (ordered)

1. **Quick wins (done in repo)** — F1: align `MODULE_ROUTES` copy with UI. F2: override webhook-related env in Playwright `webServer` so `.env.local` does not affect baselines; document in `e2e/CLAUDE.md`.
2. **Medium** — F3: Consider `reuseExistingServer: !process.env.CI` or document “kill :3000 before e2e” more visibly; optional health check that fixture env is active.
3. **Larger / design** — F5: tighten overview sentence; F4: add `CONTRIBUTING.md` if the project wants external contributors.

## Open questions

- Should a11y specs run only against `next start` (as commented in `dashboard.a11y.spec.ts`) in CI to avoid dev/HMR noise?
- Should `dashboard-shell` assert **either** unconfigured **or** a second stable fixture for “configured but empty subscriptions” instead of env overrides?

## Verification (after fixes)

- `pnpm typecheck` — pass (pre-fix).
- `pnpm test` — 368 tests pass (pre-fix).
- `pnpm exec playwright test e2e/dashboard-shell.spec.ts --project=chromium` — 10/10 pass (post-fix).

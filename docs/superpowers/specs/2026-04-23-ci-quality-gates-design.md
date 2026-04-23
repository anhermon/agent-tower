# CI Quality Gates — Design

Status: accepted · Owner: @angel · Date: 2026-04-23

## Goal

Give any agent (human or AI) working in this repo a single, trustworthy answer
to five questions:

1. Is the project healthy?
2. Is there regression?
3. Does all functionality work?
4. Are dependencies safe? (no known CVEs, no disallowed licenses, no leaked secrets)
5. Does the UI render correctly and within UX SLAs?

The system must be **local-first** (GitHub Actions deferred), **tiered by
cost**, and must emit machine-readable reports so agents can introspect state
without re-running slow tools.

## Tiered Model

| Tier | Trigger | Budget | Purpose |
|------|---------|--------|---------|
| T0 | editor save | <200ms/file | format + trivial lint; zero friction |
| T1 | `git commit` (lefthook pre-commit) | <10s | staged-file checks, block obvious breakage |
| T2 | `git push` (lefthook pre-push) | <2min | full-repo fast signal |
| T3 | `task ci` (on-demand / future PR) | <10min | full correctness + perf + security gate |
| T4 | `task ci:nightly` (cron) | ~30–60min | deep/expensive checks, trends |

## Tool Matrix

Format + fast lint: **Biome** (single Rust binary, runs at T0/T1).
Deep semantic lint: **ESLint flat config** (T2) with `@typescript-eslint`,
`eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`,
`eslint-plugin-import`, `eslint-plugin-sonarjs`, `@next/eslint-plugin-next`.
Biome handles format/imports/basic-lint; ESLint is disabled for overlap.

Types: `tsc --noEmit` (already in place).

Unit tests: Vitest with per-package coverage thresholds (≥70% lines changed on
pure-logic packages — `core`, `events`, `storage`; ≥50% on UI packages where
behavior is better covered by integration/E2E).

E2E smoke: Playwright (existing, hostname-bound to `127.0.0.1`).
Full E2E + visual regression: Playwright `toHaveScreenshot` at T4.
A11y: `@axe-core/playwright` integrated into existing Playwright runs at T3.

Performance: **Lighthouse CI** (`@lhci/cli`) with `lighthouserc.json` +
`budget.json`. Budgets: LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms, TBT ≤ 200ms,
perf score ≥ 90, a11y score ≥ 95. Runs 3× per route at T3, full sweep at T4.

Bundle size: `size-limit` with `@size-limit/preset-app` (hard byte budgets per
route chunk, tracked in `.size-limit.json`).

Dead code / unused deps: `knip`.

Dependencies — CVEs: `pnpm audit --prod --audit-level=high` at T2;
`osv-scanner` at T4 for deeper transitive + cross-ecosystem coverage.

SAST: `semgrep --config=auto` at T4.

Secrets: `gitleaks protect --staged` at T1 (staged diff), `gitleaks detect`
full repo at T4.

SBOM + license: `@cyclonedx/cdxgen` (SBOM artifact) +
`license-checker-rseidelsohn` (fail on GPL/AGPL) at T3.

Dep freshness: `pnpm outdated --long` at T4 (report-only).

Mutation testing: **Stryker** at T4, scoped to `packages/core` and
`packages/events` (too slow for UI code).

Hook runner: **lefthook** (Go binary, parallel stages, YAML).
Staged-file driver: `lint-staged` via lefthook for T1.

Build: `pnpm -r build` + `pnpm --filter @control-plane/web build` at T2/T3.

## Test Strategy

Test tiers, one source of truth per layer:

| Layer | Framework | Location | TDD/BDD | Tier |
|-------|-----------|----------|---------|------|
| Unit (pure logic) | Vitest | `packages/*/src/**/*.test.ts` | TDD | T2 |
| Unit (UI components) | Vitest + React Testing Library | `apps/web/components/**/*.test.tsx` | TDD | T2 |
| Integration | Vitest | `apps/web/lib/**/*.test.ts` | TDD | T2 |
| API route | Vitest against Next route handlers via `next-test-api-route-handler` style wrappers | `apps/web/app/api/**/*.test.ts` | TDD | T2 |
| E2E smoke | Playwright | `e2e/**/*.smoke.spec.ts` | BDD-style (`describe`/`it` user journeys) | T3 |
| E2E full | Playwright (all browsers, all routes) | `e2e/**/*.spec.ts` | BDD | T4 |
| Visual regression | Playwright screenshots | `e2e/visual/**/*.spec.ts` | — | T4 |
| A11y | @axe-core/playwright inside smoke run | `e2e/a11y/**/*.spec.ts` | — | T3 |

TDD for pure functions, adapter mapping, and utility code — red/green/refactor
at the unit layer. BDD for end-to-end user journeys — `describe('a user
opening the overview page', () => { it('sees their agents', ...) })` at the
Playwright layer.

Coverage: Vitest `v8` provider, reports emitted as `lcov` + `json-summary` +
`text` to `.coverage-reports/<package>/`. Aggregated summary written to
`.ci/reports/coverage.json` by `scripts/ci-health.mjs`.

## Taskfile Topology

```
task verify       # kept: typecheck + test (local sanity)
task ci:fast      # T2: lint + typecheck + unit + build + pnpm audit
task ci           # T3: ci:fast + e2e:smoke + a11y + lhci + size + knip + sbom + license
task ci:security  # T3 subset: pnpm audit + gitleaks + license + sbom
task ci:perf      # T3 subset: build + lhci + size-limit
task ci:nightly   # T4: full e2e + visual + full lhci + osv-scanner + semgrep + stryker + outdated
task ci:health    # Aggregator: reads .ci/reports/*.json; prints green/red board
```

## Report Contract

Every tool writes a machine-readable summary to `.ci/reports/<tool>.json`:

```json
{
  "tool": "lhci",
  "tier": "T3",
  "ranAt": "2026-04-23T18:42:00Z",
  "status": "pass" | "fail" | "skipped",
  "summary": { /* tool-specific */ },
  "artifacts": [".lighthouseci/..."],
  "durationMs": 78500
}
```

`scripts/ci-health.mjs` reads every file under `.ci/reports/`, writes
`.ci/reports/latest.json`, and prints a one-line health summary. An agent can
then answer "is the project healthy?" with a single file read.

## Lefthook Wiring

- `pre-commit` (T1): biome check (staged), gitleaks protect (staged),
  affected-package typecheck via `pnpm -r --filter ...[HEAD] typecheck`.
- `pre-push` (T2): `task ci:fast`.
- `commit-msg`: Conventional Commits validator.

## Out of Scope (explicit)

- GitHub Actions workflow YAML — deferred until remote CI is agreed.
- Renovate/Dependabot — external bot.
- LHCI self-hosted server — using `temporary-public-storage` until history >7d
  matters.
- SaaS visual regression (Percy/Chromatic) — Playwright native screenshots
  suffice.

## Implementation Waves

Wave 1 (parallel subagents, isolated config files, no `package.json` edits):
Biome, ESLint, LHCI, Security, Quality, Coverage, Testing-strategy.

Wave 2 (sequential): batched `pnpm add -D -w ...`, Taskfile rewrite,
lefthook.yml, `scripts/ci-health.mjs`, `.gitignore` additions.

Wave 3: smoke-run each tier, fix regressions, commit.

Wave 4: perf baseline → investigation subagents → hypothesis validation →
enhancement subagents → re-baseline.

Wave 5: author `~/.claude/skills/ui-perf-loop/` to codify this workflow for
any UI project.

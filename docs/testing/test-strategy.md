# Test Strategy

Status: accepted · Owner: @angel · Last updated: 2026-04-23

This document is the authoritative reference for how tests are organized, named,
and authored in the control-plane monorepo. It complements (does not replace)
the CI gates designed in
[`docs/superpowers/specs/2026-04-23-ci-quality-gates-design.md`](../superpowers/specs/2026-04-23-ci-quality-gates-design.md).

## Test Pyramid (9 layers)

Ordered cheapest → most expensive. Every layer has exactly one source of
truth; nothing belongs to two layers.

| # | Layer | Framework | Location | Tier |
|---|-------|-----------|----------|------|
| 1 | Unit / pure logic | Vitest | `packages/*/src/**/*.test.ts` | T2 |
| 2 | Unit / UI components | Vitest + React Testing Library + jsdom | `apps/web/components/**/*.test.tsx` | T2 |
| 3 | Integration (utility libs, adapter glue) | Vitest | `apps/web/lib/**/*.test.ts`, `packages/*/src/**/*.integration.test.ts` | T2 |
| 4 | API route handlers | Vitest (Next route handler invocation) | `apps/web/app/api/**/*.test.ts` | T2 |
| 5 | E2E smoke | Playwright | `e2e/smoke/**/*.smoke.spec.ts` | T3 |
| 6 | E2E full (multi-browser, long journeys) | Playwright | `e2e/journeys/**/*.spec.ts` | T4 |
| 7 | Visual regression | Playwright `toHaveScreenshot` | `e2e/visual/**/*.visual.spec.ts` | T4 |
| 8 | Accessibility | `@axe-core/playwright` | `e2e/a11y/**/*.a11y.spec.ts` | T3 |
| 9 | Performance assertions | Lighthouse CI (`@lhci/cli`) | `lighthouserc.json` + `budget.json` | T3 (sampled) / T4 (full) |

Tier meaning (from the CI design doc): T0 editor save, T1 pre-commit, T2
pre-push, T3 `task ci`, T4 `task ci:nightly`.

## TDD vs BDD

**TDD layers** (write the test first, then the code):

- Pure logic — `packages/*/src/**` (domain types, mappers, adapter contracts,
  capability checks, storage repositories).
- UI component props / rendering — `apps/web/components/**/*.test.tsx`
  (presentation contracts, conditional rendering, ARIA wiring).
- Utility libs — `apps/web/lib/**/*.test.ts` (formatters, source loaders,
  analytics helpers).
- API route handlers — `apps/web/app/api/**/*.test.ts` (input validation,
  response shape, error states).

Workflow: red → green → refactor. Prefer many small, isolated unit tests over
a few large end-to-end stubs. No `it('works')` tests — each test name must
describe a single observable behavior.

**BDD layers** (user-journey `describe`/`it` with `given_when_then` names):

- All Playwright specs under `e2e/`.

Example:

```ts
import { test, expect } from "@playwright/test";

test.describe("a user visiting the overview", () => {
  test("sees an empty-state when no agents are configured", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No agent runtimes")).toBeVisible();
  });
});
```

For continuity with the existing smoke suite, snake-case
`given_..__when_..__then_..` names are also acceptable inside `test.describe`.

## Naming Conventions

| Suffix | Meaning | Runner |
|--------|---------|--------|
| `*.test.ts` / `*.test.tsx` | Unit + integration + API route | Vitest |
| `*.integration.test.ts` | Unit-framework test that touches multiple modules | Vitest |
| `*.smoke.spec.ts` | E2E smoke — runs in `task ci` (T3) | Playwright |
| `*.spec.ts` (under `e2e/journeys/`) | Full E2E journey (T4) | Playwright |
| `*.visual.spec.ts` | Screenshot baselines (T4) | Playwright |
| `*.a11y.spec.ts` | axe-core accessibility scans (T3) | Playwright |

A Playwright file without a tier suffix is treated as a full journey. The
existing `e2e/dashboard-shell.spec.ts` predates this convention and is
grandfathered as a smoke spec; do not add new untagged specs at the `e2e/`
root.

## Directory Layout (target final state)

```
e2e/
  smoke/*.smoke.spec.ts        # T3 — runs in `task ci`
  journeys/*.spec.ts           # T4 — full flows, all browsers
  a11y/*.a11y.spec.ts          # T3 — axe-core integrated
  visual/*.visual.spec.ts      # T4 — screenshot baselines
  dashboard-shell.spec.ts      # grandfathered smoke baseline
  global-setup.ts              # fixture roots
apps/web/
  app/api/**/*.test.ts         # T2 — API route handler tests
  components/**/*.test.tsx     # T2 — RTL component tests
  lib/**/*.test.ts             # T2 — utility + source-loader tests
packages/
  */src/**/*.test.ts           # T2 — pure-logic units
```

API route tests use a minimal fetch-style wrapper: import the route's exported
`GET`/`POST` handler directly from `apps/web/app/api/<route>/route.ts`, invoke
it with a synthesized `Request`, and assert on the returned `Response`. This
stays library-free and avoids pulling in `next-test-api-route-handler` unless
we need middleware semantics later.

## Coverage Bars

Verbatim from
[`docs/superpowers/specs/2026-04-23-ci-quality-gates-design.md`](../superpowers/specs/2026-04-23-ci-quality-gates-design.md):

> Unit tests: Vitest with per-package coverage thresholds (≥70% lines changed
> on pure-logic packages — `core`, `events`, `storage`; ≥50% on UI packages
> where behavior is better covered by integration/E2E).

> Coverage: Vitest `v8` provider, reports emitted as `lcov` + `json-summary` +
> `text` to `.coverage-reports/<package>/`. Aggregated summary written to
> `.ci/reports/coverage.json` by `scripts/ci-health.mjs`.

Lighthouse performance budgets (from the same spec):

> LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms, TBT ≤ 200ms, perf score ≥ 90, a11y
> score ≥ 95. Runs 3× per route at T3, full sweep at T4.

Do not invent new numbers in this document. If you need to change a
threshold, amend the CI design spec first and link the commit here.

## What NOT to Test

- **Trivial re-exports.** `export { foo } from "./foo"` needs no test.
- **Tailwind class presence.** Testing `toHaveClass("bg-red-500")` couples
  tests to styling. Use ARIA roles and visible text instead.
- **Framework internals.** Don't test that Next.js renders a `<Link>` or that
  React schedules an effect. Trust the framework; test our code.
- **Snapshot dumps of large JSON.** Inline-assert the 1–3 fields you care
  about. Snapshots rot silently.
- **Private helpers.** Test the public surface. If a helper is complex enough
  to merit its own test, it is complex enough to export.
- **Implementation details.** `expect(wrapper.state).toEqual(...)` is banned;
  test what the user sees or what the API returns.

## Flakiness Policy

- Any test quarantined twice in a week (via `test.skip`, `test.fixme`, or a
  temporary `.only` scope to dodge a failure) is **deleted or rewritten** on
  the third occurrence. No perpetual quarantine.
- A flaky Playwright test must be filed as an issue with: the spec path, the
  failing assertion, the observed vs expected output, and the frequency
  (`N/M runs`). Link the issue in the `test.fixme` reason string so the next
  person finds it.
- Serial fixture specs (`workers: 1` + `test.describe.configure({ mode:
  "serial" })`) must clean up in `afterAll`; a leaked fixture that makes
  `dashboard-shell.spec.ts` flaky counts against the owning spec's budget.
- Unit-test flakiness is zero-tolerance: a non-deterministic Vitest test is a
  bug, not a quarantine candidate.

## Related Documents

- `docs/superpowers/specs/2026-04-23-ci-quality-gates-design.md` — tiered CI
  model, tooling choices, taskfile topology, report contract.
- `e2e/CLAUDE.md` — Playwright local conventions (hostname, fixture roots,
  serial execution).
- `apps/web/CLAUDE.md` — dashboard UI conventions referenced by component
  tests.

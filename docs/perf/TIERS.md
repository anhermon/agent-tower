# Performance assertion tiers (LHCI + coverage)

This repo’s **UI perf loop** is: Lighthouse CI → rank slowest surfaces → **interaction coverage** (see `e2e/perf-coverage.perf.spec.ts`) → investigate → implement → re-measure.

**“All green” on Tier 1 navigation-only LHCI is not enough** to claim there is nothing left to optimize. Tier advancement and Playwright coverage are required (see team skill `ui-perf-loop`).

## Tier ladder

Numeric gates live in `lighthouserc.json` (dev server `:3000`) and `lighthouserc.perf.json` (isolated build `:3100` via `task test-server:up`). **Keep both files aligned** when changing thresholds.

| Tier | Performance (min) | LCP (ms) | TBT (ms) | CLS (max) | When to use |
|------|-------------------|----------|----------|-----------|-------------|
| **1** | 0.90 | 2500 | 200 | 0.10 | Default CI gate; first baseline. |
| **2** | 0.95 | 2000 | 100 | 0.05 | **Target before declaring “pass”** on a mature dashboard. |
| **3** | 0.98 | 1800 | 50 | 0.03 | Stretch; stop only with a documented floor in `improvement-map.md`. |

## Tightening when everything passes

1. Run **`task lhci:perf`** (or `pnpm lhci autorun --config=lighthouserc.perf.json` with server up).
2. Run **`pnpm test:e2e:perf`** (scroll + interactions; set `TEST_SERVER_PORT=3100` if matching the perf server).
3. If **both** pass at the current tier, **edit both lighthouserc files** to the next tier’s numbers and repeat until Tier 3 or a real regression to fix.

## Optional mobile / throttling axis

If desktop Tier 3 is too easy, add a second config (e.g. `lighthouserc.mobile.json`) with `preset: mobile` or custom throttling, **document relaxed numbers here**, and run it in nightly CI only.

## Related docs

- `docs/perf/coverage-matrix.md` — human checklist; keep in sync with LHCI URLs and Playwright scenarios.
- `docs/perf/improvement-map.md` — investigation backlog and documented floors.
- `@lhci/cli` **does not** combine `budgetsFile` with custom `assertions` in v0.14; byte budgets use **`task size`** / `scripts/ci/bundle-size.mjs`.

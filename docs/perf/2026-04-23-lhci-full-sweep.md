# LHCI full sweep — 2026-04-23

**Collect:** `task test-server:up` → `task lhci:perf` — 14 URLs × 3 runs, desktop preset, `http://127.0.0.1:3100`, `NEXT_DIST_DIR=.next.perf`. Wall time ~51 min.

**Assert:** Initially failed: `lhci:assertions-legacy` is not a valid preset in `@lhci/cli@0.14.0`, and that CLI forbids **`budgetsFile` together with custom `assertions`**. `lighthouserc.json` and `lighthouserc.perf.json` were updated to **explicit `assertions` only** (no preset, no `budgetsFile`), **`interaction-to-next-paint`: `"off"`** when the audit does not run on desktop. Re-run: `pnpm lhci assert --config=lighthouserc.perf.json` → **exit 0** on the same `.lighthouseci/` artifacts.

**Ranking** (median of 3, severity `= 2×(1−perf) + LCP/2500 + TBT/200 + CLS/0.1`, higher = worse):

| # | Route | Perf | LCP (ms) | TBT (ms) | CLS | FCP (ms) | TTI (ms) | DOM | Total JS (KB) | Severity |
|---|-----|-----:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `/sessions/overview` | 0.98 | 698 | 110 | 0.00 | 257 | 1042 | 762 | 324 | 0.87 |
| 2 | `/sessions/activity` | 0.99 | 824 | 48 | 0.01 | 252 | 941 | 1575 | 308 | 0.65 |
| 3 | `/sessions/tools` | 1.00 | 797 | 0 | 0.03 | 249 | 797 | 1129 | 299 | 0.62 |
| 4 | `/sessions/costs` | 1.00 | 691 | 24 | 0.01 | 257 | 928 | 707 | 309 | 0.50 |
| 5 | `/sessions/projects` | 1.00 | 716 | 0 | 0.00 | 334 | 716 | 2493 | 260 | 0.29 |
| 6 | `/sessions` | 1.00 | 688 | 0 | 0.00 | 338 | 688 | 636 | 265 | 0.28 |
| 7 | `/agents` | 1.00 | 618 | 0 | 0.00 | 259 | 618 | 1243 | 167 | 0.25 |
| 8 | `/skills` | 1.00 | 562 | 0 | 0.00 | 252 | 562 | 291 | 174 | 0.22 |
| 9 | `/` | 1.00 | 534 | 0 | 0.00 | 224 | 534 | 279 | 155 | 0.21 |
| 10 | `/mcps` | 1.00 | 526 | 0 | 0.00 | 216 | 526 | 157 | 144 | 0.21 |
| 11 | `/replay` | 1.00 | 525 | 0 | 0.00 | 215 | 525 | 157 | 144 | 0.21 |
| 12 | `/channels` | 1.00 | 523 | 0 | 0.00 | 213 | 523 | 157 | 144 | 0.21 |
| 13 | `/kanban` | 1.00 | 522 | 0 | 0.00 | 212 | 522 | 134 | 150 | 0.21 |
| 14 | `/webhooks` | 1.00 | 514 | 0 | 0.00 | 213 | 514 | 137 | 151 | 0.21 |

**Gates:** No route fails `categories:performance ≥ 0.9`, `LCP ≤ 2500`, `TBT ≤ 200`, or `CLS ≤ 0.1`. Heaviest route by severity is **`/sessions/overview`** (TBT 110 ms, perf 0.98) — still within budgets.

**Budget.json:** Resource byte timings are no longer wired through LHCI `budgetsFile` in this CLI version; keep `budget.json` aligned manually or enforce via `task size` / `scripts/ci/bundle-size.mjs`.

# Perf coverage matrix (LHCI + Playwright)

**LHCI URLs** are the source of truth for **initial navigation** (`lighthouserc.perf.json` → `ci.collect.url`).

**Playwright** must exercise **lazy**, **below-the-fold**, and **interactive** UI that Lighthouse’s default run skips. The executable suite is `e2e/perf-coverage.perf.spec.ts` (`pnpm test:e2e:perf`).

Update this table when you add routes to LHCI or new primary modals/CTAs.

## Routes aligned with LHCI perf config

Mark **Playwright** after you add or verify scenarios in `perf-coverage.perf.spec.ts`.

| Route | LHCI | Playwright (scroll) | Primary interactions (popovers, CTAs) | Excluded? |
|-------|------|----------------------|----------------------------------------|-----------|
| `/` | ✓ | ✓ | Theme toggle (optional) | |
| `/agents` | ✓ | ✓ | — | |
| `/sessions` | ✓ | ✓ | — | |
| `/sessions/overview` | ✓ | ✓ | — | |
| `/sessions/costs` | ✓ | ✓ | — | |
| `/sessions/activity` | ✓ | ✓ | — | |
| `/sessions/tools` | ✓ | ✓ | — | |
| `/sessions/projects` | ✓ | ✓ | — | |
| `/kanban` | ✓ | ✓ | — | |
| `/mcps` | ✓ | ✓ | — | |
| `/channels` | ✓ | ✓ | — | |
| `/replay` | ✓ | ✓ | — | |
| `/webhooks` | ✓ | ✓ | — | |
| `/skills` | ✓ | ✓ | Date range popover, Refresh | |

## Not in LHCI (document if intentional)

| Route | Reason |
|-------|--------|
| `/sessions/[id]` | Deep session replay; heavy; add optional perf project or nightly flow. |
| `/skills/[id]` | Detail view; extend perf spec when Tier 2+ demands it. |
| `/agents/[id]`, `/kanban/[id]`, `/webhooks/[id]` | Detail routes — same as above. |

## Excluded from matrix

_Routes that require auth or are deprecated — list here with one-line reason._

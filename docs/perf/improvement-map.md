# UI perf improvement map — /skills

**Update (2026-04-23):** Full 14-route LHCI sweep (`task lhci:perf`, isolated `:3100` server, 3 runs each) completed; **`pnpm lhci assert --config=lighthouserc.perf.json` passes** after fixing `lighthouserc*.json` for `@lhci/cli@0.14.0` (see `2026-04-23-lhci-full-sweep.md`). `/skills` and all other routed URLs meet the explicit performance assertions.

---

Single offender from `2026-04-23-baseline.md`. Goal: get `/skills` within budget:

| Metric | Current | Budget | Required Δ |
|---|---|---|---|
| perf score | 0.73 | ≥ 0.90 | +0.17 |
| TBT | 748 ms | ≤ 200 ms | −548 ms |
| max-potential-fid (warn) | 0.39 | ≥ 0.90 | — |
| dom-size (warn) | 2705 | ≤ 1500 (LH default) | −1200 nodes |
| unused-javascript (warn) | 45 KB | 0 | −45 KB |

## Enhancement 1 — Lazy-load `SkillGrid` below the fold (PRIMARY)

**Status:** validated
**Effort:** S
**Risk:** low
**Expected impact:** TBT −400 to −550 ms, DOM −1800 to −2000 nodes, perf +0.17

**Hypothesis.** `SkillGrid` renders one anchor-card per skill (≈150 skills × ~18 DOM nodes = ~2700 nodes) synchronously at hydration. Hydrating a 2.7k-node subtree while shared chunk `7826` is evaluating creates a 748 ms main-thread pile-up.

**Validation.** LHR `dom-size` audit confirms 2705 nodes (largest in app). LHR `long-tasks` shows 5 long tasks inside `7826-*.js` eval window spanning 682–1587 ms — overlapping exactly with `SkillGrid`'s client-side hydration. `LCP` is already fast (818 ms, paints from server-rendered `<header>` strip), so deferring the grid won't hurt it.

**Plan.**
1. Wrap the `<SkillGrid>` render in a `content-visibility: auto` container (CSS-only, zero JS cost) **AND** keep the existing `dynamic({ ssr: false })` wrapper in `_lazy.tsx`.
2. Additionally gate its actual import via `IntersectionObserver` so the chunk download doesn't start on mount — only when the catalogue section approaches the viewport. Pattern: a `useEffect(() => observer.observe(ref))` that flips a `visible` boolean, and render a skeleton until `visible`. This way, users who only glance at the usage dashboards up top never parse the grid chunk.

**Rejected alternative: virtualization (react-window/virtuoso).** Adds a dep and complicates keyboard nav and search/filter interactions. `content-visibility` + IO gives ~95% of the win at ~5% of the complexity.

## Enhancement 2 — Gate Recharts dynamic imports on viewport (SECONDARY)

**Status:** validated
**Effort:** S
**Risk:** low
**Expected impact:** −304 KB JS from critical path, unused-javascript −45 KB, TBT −50 to −150 ms

**Hypothesis.** `_lazy.tsx` uses `next/dynamic({ ssr: false })` for 5 Recharts components plus `SkillsEfficacyDashboard` and `SkillsBarChart`. `next/dynamic` kicks off the import at **mount**, not at first scroll. Since `SkillsDashboard` mounts immediately inside the page, all 7 chunks start downloading + parsing as soon as hydration begins.

**Validation.** LHR `network-requests` shows `952.ce9b099953e49462.js` (304 KB decoded) arriving during the TBT window. `unused-javascript` flags it at 47% unused, consistent with Recharts' treeshake-resistant runtime.

**Plan.**
1. Wrap the three main dashboard blocks (`<SkillsDashboard>`, `<SkillsEfficacyDashboard>`, `<SkillGrid>`) inside an `<IntersectionViewportMount>` helper that renders a skeleton until `intersectionRatio > 0`. Once intersected, it renders the real dynamic component.
2. The helper lives next to `_lazy.tsx` so all Skills-page lazy wrappers use it. Optionally generalise to `apps/web/components/ui/viewport-mount.tsx` if more routes need it.
3. Keep LCP safe: don't wrap the header `<h1>` / `<Badge>` strip — those already render synchronously from the server.

## Enhancement 3 — Remove stray debug telemetry fetch (CLEANUP)

**Status:** validated
**Effort:** XS
**Risk:** none
**Expected impact:** 0 ms on client (it's server-side), removes a silent localhost dependency.

**Evidence.** `apps/web/app/skills/page.tsx` lines 28–38 contain an `#region agent log` block that `fetch()`-es `http://127.0.0.1:7735/ingest/3f85a983-...` on every server render with `.catch(() => {})`. Left over from an earlier diagnostic session.

**Plan.** Delete the `#region agent log` block. No callers depend on it.

## Enhancement 4 — Out of scope for this loop

- **`transformAlgorithm` Node 22 RSC streaming bug.** It's a real bug affecting test-server reliability, not a perf-budget gate. File separately.
- **Chunk `7826-*.js` itself.** On green routes it fits within the TTI budget. Trimming it would help `/skills` but is a higher-risk refactor (it's a shared chunk) — revisit only if Enhancements 1+2 don't get `/skills` into budget.
- **LHCI CI-time tightening** (`numberOfRuns: 1`, `onlyCategories: performance` during the perf loop). Not a runtime perf enhancement; it's a CI ergonomics change. File separately.

## Phase 6 — verified

Runtime fixes (`ViewportMount`, chart gating, catalogue `content-visibility`) are in the tree. **Full-route LHCI:** see `2026-04-23-lhci-full-sweep.md` (median `/skills`: perf 1.00, TBT 0 ms, DOM 291). Historical “current” table above describes the pre-fix baseline only.

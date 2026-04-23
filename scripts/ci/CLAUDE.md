# scripts/ci — Index

## Responsibility
- Per-tool CI wrappers that invoke the real checker, capture its output, and emit a **standardized JSON report** to `.ci/reports/<tool>.json`.
- The single source of truth for "is the project healthy?" — `scripts/ci-health.mjs` (at the repo root) aggregates every file in `.ci/reports/` into `.ci/reports/latest.json` and prints the green/red board.

## Read First
- `lib/report.mjs` — `writeReport({tool, tier, status, summary, artifacts, durationMs})`. Every wrapper uses this.
- `../ci-health.mjs` — aggregator. Run via `task ci:health`.
- Each wrapper below is self-contained (no shared state beyond `lib/report.mjs`).

## Wrappers
| Script | Tool wrapped | Tier | Writes |
|---|---|---|---|
| `audit.mjs` | `pnpm audit --json --prod --audit-level=high` | T2 | `.ci/reports/audit.json` |
| `license-check.mjs` | `license-checker-rseidelsohn` | T3 | `.ci/reports/licenses.json` + `licenses.full.json` |
| `sbom.mjs` | `@cyclonedx/cdxgen` | T3 | `.ci/reports/sbom.cdx.json` + `sbom.json` |
| `knip-run.mjs` | `knip --reporter json` | T3 | `.ci/reports/knip.json` |
| `bundle-size.mjs` | `size-limit --json` (needs a web build) | T3 | `.ci/reports/bundle-size.json` |
| `coverage-report.mjs` | post-processes `.coverage-reports/coverage-summary.json` | T2 | `.ci/reports/coverage.json` |

## Report contract
```
{ tool, tier: "T1"|"T2"|"T3"|"T4", ranAt, status: "pass"|"fail"|"skipped",
  summary: {...}, artifacts: [...], durationMs }
```
`status: "skipped"` when the underlying tool/binary isn't installed — wrappers must not crash on a missing external (e.g. `gitleaks`, `osv-scanner`). Only `status: "fail"` causes `task ci:health` to flip red.

## Local Conventions
- ES modules (`.mjs`). Node 22+ built-ins only (`node:fs/promises`, `node:child_process`). No runtime deps.
- Wrappers are idempotent and output-only — they never mutate source files.
- Prefer `writeReport(...)` over hand-rolled JSON writes. Keeps the board aggregator stable.
- When adding a new tool: colocate the wrapper here, call `writeReport`, and wire it into the appropriate `task ci:*` tier in `../../Taskfile.yaml`.

## Sharp Edges
- `bundle-size.mjs` requires an existing `apps/web/.next` build. `task size` handles the dep; running the script directly will report zeroes on a cold tree.
- `knip` is aggressive — new workspace packages must be registered in `/knip.json` or it flags legitimate entry points as unused.
- `.ci/reports/` is gitignored; artifacts are not durable across branches.

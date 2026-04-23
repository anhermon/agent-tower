# packages/testing — Index

## Responsibility
- Shared test fixtures for the control plane. Exposes `./fixtures/core` (domain-type fixtures) and `./fixtures/claude-code` (JSONL transcript fixtures for adapter analytics tests).
- Source-exported (not built): importers consume the `.ts` directly, so Vitest + TS can pick up types without a build step.
- Rationale: [ADR-0001](../../docs/architecture/decisions/0001-phase-1-skeleton.md) (fixtures precede real data flows in Phase 1).

## Read First
- `package.json` — see the `exports` map for entry points.
- `fixtures/core/index.ts` — canonical-domain test fixtures.
- `fixtures/claude-code/index.ts` — JSONL transcript fixtures (single-turn, multi-turn, compaction, thinking, mcp-tool, task-agent, web-search).

## Local Conventions
- **Fixtures only.** No assertion helpers, no test runners, no global setup. Keep behavior out of this package.
- **Canonical types.** Fixtures use `@control-plane/core` domain types. Do not introduce vendor-specific shapes.
- **Additive.** Add new fixture files (e.g., `fixtures/events/`) behind new `exports` entries rather than mutating existing fixture objects in place — snapshots elsewhere may depend on them.

## Sharp Edges
- Because the export is raw TS, any non-TS consumer (plain Node scripts, etc.) will fail to resolve it. It's intended for Vitest / tsc contexts only.

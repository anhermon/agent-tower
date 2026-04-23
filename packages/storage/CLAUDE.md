# packages/storage — Index

## Responsibility
- Repository interfaces (`repositories.ts`) and models (`models.ts`, `schema.ts`) for control-plane persistence.
- Phase 1 ships a single `in-memory.ts` implementation used as a placeholder.
- Rationale: [ADR-0003](../../docs/architecture/decisions/0003-local-first-storage.md) (local-first storage), [ADR-0001](../../docs/architecture/decisions/0001-phase-1-skeleton.md) (interfaces before backends).

## Read First
- `src/index.ts` — public surface.
- `src/repositories.ts` — repository interface definitions. Every real storage backend implements these.
- `src/models.ts` + `src/schema.ts` — storage-side shapes (aligned with but not identical to `@control-plane/core` domain types).
- `src/in-memory.ts` (+ `in-memory.test.ts`) — reference implementation and contract test.

## Dependencies
- Depends on `@control-plane/events` (workspace).
- No DB drivers, no filesystem, no network. A real persistent backend must ship as a separate implementation module (e.g., `src/sqlite.ts`) behind the same interfaces.

## Local Conventions
- **Interface first.** New persistence concerns get a repository method on the interface + a test before any backend adds support.
- **Keep storage shapes stable.** They are a contract between the storage layer and anything that serializes them. Prefer adding new fields/tables to modifying existing ones.
- **No UI or framework imports.**

## Sharp Edges
- `in-memory.ts` is not durable and discards state on restart — do not use it for anything requiring persistence across processes.
- Not yet consumed by `apps/web`. When introducing it, instantiate behind a server-only module so storage never leaks into client bundles.

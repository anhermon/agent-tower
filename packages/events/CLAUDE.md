# packages/events — Index

## Responsibility
- Typed event bus + append-only event log abstractions used by the control plane.
- Also ships a `mock-stream` helper for UI and tests to iterate over synthetic event flows without wiring a real source.
- Rationale: [ADR-0001](../../docs/architecture/decisions/0001-phase-1-skeleton.md) (skeleton-only phase), [ADR-0003](../../docs/architecture/decisions/0003-local-first-storage.md) (local-first defaults).

## Read First
- `src/index.ts` — public surface.
- `src/types.ts` — event envelope + subscription shapes.
- `src/bus.ts` — in-memory typed event bus (sibling test: `bus.test.ts`).
- `src/event-log.ts` — append-only log interface.
- `src/mock-stream.ts` — deterministic mock event producer for placeholder UIs and tests.

## Local Conventions
- **Append-only semantics.** The log interface is write-once + tail; do not add mutation or compaction without an ADR.
- **Canonical envelopes.** Events are typed via `@control-plane/core` domain types where applicable — don't introduce parallel event shapes here.
- **In-memory only in Phase 1.** A hosted/persistent bus is a future concern and should be a separate implementation behind the same interface, not a branch inside these files.
- **No framework coupling.** This package must stay usable from Node, browser, and workers.

## Sharp Edges
- Nothing in `apps/web` consumes this package yet. When wiring it in, do so through a server-only module — the bus is fine to share, but `event-log` persistence decisions belong at the app boundary, not here.
- `mock-stream` is for placeholders and tests. Do not use it as a shim for a missing real source in production paths — render an empty state instead (see root `CLAUDE.md` "no fabricated data").

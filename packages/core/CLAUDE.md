# packages/core — Index

## Responsibility
- Canonical domain types and capability-based adapter contracts for the whole control plane.
- The single place where "what a session / agent / event / skill / channel / MCP is" is defined.
- **Minimal runtime dependencies.** `zod` is the sole runtime dep (used by `domain/validators.ts` for zero-information-loss JSONL parsing). No I/O, no adapters, no frameworks.
- Rationale: [ADR-0002](../../docs/architecture/decisions/0002-agent-agnostic-core.md) (agent-agnostic core).

## Read First
- `src/index.ts` — what's exported.
- `src/domain/` — the canonical shapes (`sessions`, `agents`, `events`, `tools`, `costs`, `skills`, `channels`, `mcps`, `tickets`, `replay`, `analytics`, `projects`, `live`, `validators`, `common`).
- `src/contracts/` — adapter interfaces grouped by capability (`agent-adapter`, `session-ingest-adapter`, `session-analytics-adapter`, `replay-adapter`, `runtime-control-adapter`, `mcp-adapter`, `channel-adapter`, `pricing-adapter`, `common`).
- `src/lib/pricing.ts` — model pricing table, cost estimation, and cache-efficiency math (ported from cc-lens, MIT attribution).
- `src/capabilities.ts` — capability enumeration + typed `supports(...)` helper used by consumers to branch safely.
- `docs/architecture/adapter-contracts.md`, `docs/architecture/data-model.md` — rationale.

## Local Structure
- `domain/` — immutable value types. Prefer structural types, `readonly` fields, discriminated unions keyed on a literal `kind`/`type` field where relevant.
- `contracts/` — each file = one capability surface. Contracts consume/produce only `domain/` types.
- `capabilities.ts` — list + predicate for capability detection; keep in sync with `contracts/`. Includes `"session-analytics"`.
- `lib/` — pure utility modules. `pricing.ts` (model costs + cache efficiency).

## Local Conventions
- **No vendor names** in types or field names. Runtime identity is carried by a generic `runtime` string.
- **Additive evolution.** Widen unions and add optional fields; do not rename or remove published fields casually. Downstream adapters and UI depend on shape stability.
- **Metadata escape hatch.** Adapter-specific detail goes in a generic `metadata` bag on the relevant entity, never as a top-level typed field.
- **No side effects** (`"sideEffects": false`) — keep tree-shaking intact.
- Tests live next to the code (`*.test.ts`): `capabilities.test.ts`, `pricing.test.ts`, `tools.test.ts`, `webhooks.test.ts`, `validators.test.ts`.

## Sharp Edges
- Contracts are imported as types by both server and client code — keep the module side-effect free and do not add runtime imports.
- Adding a new capability requires updates in three places: `domain/` (new types if any), `contracts/<capability>-adapter.ts`, and `capabilities.ts`. The `supports(...)` helper must stay exhaustive.
- Changes here ripple everywhere. Run `pnpm -r typecheck` from the repo root after editing.

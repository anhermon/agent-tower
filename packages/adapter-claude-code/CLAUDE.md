# packages/adapter-claude-code — Index

## Responsibility
- First real adapter: reads local Claude Code `*.jsonl` transcripts from an **explicitly configured root** and normalizes them to `@control-plane/core` domain types.
- Implements the `session-ingest` capability (read side). No writes, no network, no ambient defaults.
- Rationale: [ADR-0002](../../docs/architecture/decisions/0002-agent-agnostic-core.md) (adapter sits behind capability contract), [ADR-0003](../../docs/architecture/decisions/0003-local-first-storage.md) (read from local filesystem).

> `AGENTS.md` in this directory is the authoritative mapping spec (raw entry → canonical output). Read it alongside this file; do not restate its table here.

## Read First
- `AGENTS.md` — scope, public surface, canonical mapping table, extension rules.
- `src/index.ts` — public exports.
- `src/adapter.ts` — `ClaudeCodeSessionSource` (`listSessions`, `loadSession`, `stream`).
- `src/reader.ts` (+ `reader.test.ts`) — low-level JSONL enumeration + line parsing.
- `src/normalizer.ts` (+ `normalizer.test.ts`) — pure raw→canonical mapping.
- `src/types.ts` — raw Claude Code entry shapes, kept internal.

## Entry Points / Flow
- Caller constructs `ClaudeCodeSessionSource({ directory })`.
- `listSessions()` / `loadSession(id)` → `readTranscriptFile` → `normalizeTranscript` → canonical `SessionDescriptor` + `SessionTurn[]`.
- `stream()` yields `SessionIngestBatch` values for every session under the root.

## Local Conventions
- **Read-only.** No mutations or writes of any kind.
- **Explicit directory.** Never fall back to `$HOME` or any default path — callers must pass one.
- **Graceful degradation.** Malformed lines are reported via the result's `skipped`/`errors` count, not thrown. Missing fields produce partial entities, not failures.
- **Preserve raw metadata.** Put adapter-specific detail under `turn.metadata` / `session.metadata` — do not leak Claude-shaped fields into canonical types.
- **Pure normalizer.** `normalizer.ts` must remain a pure function; all I/O stays in `reader.ts`.

## Sharp Edges
- Sidechain / attachment normalization is deliberately out of scope until a consuming UI module needs it.
- An **ingest-target** adapter (writing batches into storage) is a separate concern — it belongs near `packages/storage`, not here.
- Additional runtimes (Codex, Hermes, etc.) must ship as sibling packages. Do not branch this adapter on runtime.

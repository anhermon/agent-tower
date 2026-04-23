# Adapter: Claude Code (read-only)

First real adapter for the Modular Agents Control Plane. Reads local Claude
Code JSONL transcripts from an **explicitly configured root** and normalizes
them into canonical `@control-plane/core` types.

## Scope

- Read-only. No writes, no network.
- No ambient defaults: callers must pass an explicit `directory`.
- Missing fields degrade gracefully (malformed lines reported, not thrown).
- Raw entry metadata is preserved under `turn.metadata`/`session.metadata` for
  drill-down.

## Public surface

- `ClaudeCodeSessionSource` — high-level source adapter.
  - `listSessions()` — enumerates `*.jsonl` transcripts.
  - `loadSession(id)` — normalized transcript for one session.
  - `stream()` — async iterable of `SessionIngestBatch` values for every
    session under the root.
- `listSessionFiles` / `readTranscriptFile` — low-level helpers.
- `normalizeTranscript` — pure function mapping raw entries to canonical
  `SessionDescriptor`, `SessionTurn`, `ToolCall`, and `ToolResult`.

## Mapping rules

| Raw entry              | Canonical output                                |
| ---------------------- | ----------------------------------------------- |
| `type: user` (string)  | `SessionTurn` with `text` content, actor=user   |
| `type: user` (blocks)  | One turn per `text` / `tool_result` block       |
| `type: assistant`      | One turn per `text` / `thinking` / `tool_use`   |
| `tool_use` block       | `ToolCall` with status=`running`                |
| `tool_result` block    | `ToolResult` with `succeeded`/`failed`          |
| `type: system`         | `SessionTurn` with `system` actor               |
| any other `type`       | Skipped, counted in `skipped` on the result     |

## Extension points

- Additional runtimes (Codex, Hermes) should ship as sibling packages, not as
  branches inside this adapter.
- Sidechain/attachment normalization is intentionally out of scope until a UI
  module consumes it.
- An ingest-target adapter (persisting batches to storage) is a separate
  concern from this source adapter and lives with the storage package.

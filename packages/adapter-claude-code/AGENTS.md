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

### Transcript normalization (JSONL → canonical session types)

| Raw entry              | Canonical output                                |
| ---------------------- | ----------------------------------------------- |
| `type: user` (string)  | `SessionTurn` with `text` content, actor=user   |
| `type: user` (blocks)  | One turn per `text` / `tool_result` block       |
| `type: assistant`      | One turn per `text` / `thinking` / `tool_use`   |
| `tool_use` block       | `ToolCall` with status=`running`                |
| `tool_result` block    | `ToolResult` with `succeeded`/`failed`          |
| `type: system`         | `SessionTurn` with `system` actor               |
| any other `type`       | Skipped, counted in `skipped` on the result     |

### Analytics fold (JSONL → `SessionUsageSummary` / `ReplayData`)

Added in Wave 0 of the sessions-superset plan. All mappings are pure folds
(no I/O, no wall-clock reads); I/O stays in `reader.ts` + `adapter.ts`.

| Raw entry / field                                    | Canonical output                                             |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `assistant.message.usage.input_tokens`               | `TurnUsage.inputTokens` + summed into `ModelUsage`           |
| `assistant.message.usage.output_tokens`              | `TurnUsage.outputTokens` + summed into `ModelUsage`          |
| `assistant.message.usage.cache_creation_input_tokens`| `TurnUsage.cacheCreationInputTokens` + `ModelUsage`          |
| `assistant.message.usage.cache_read_input_tokens`    | `TurnUsage.cacheReadInputTokens` + `ModelUsage`              |
| `assistant.message.usage.cache_creation.ephemeral_5m_input_tokens` | `TurnUsage.ephemeral5mInputTokens` (optional)  |
| `assistant.message.usage.cache_creation.ephemeral_1h_input_tokens` | `TurnUsage.ephemeral1hInputTokens` (optional)  |
| `assistant.message.usage.service_tier`               | `TurnUsage.serviceTier` (optional)                           |
| `assistant.message.usage.inference_geo`              | `TurnUsage.inferenceGeo` (optional)                          |
| `assistant.message.model`                            | `SessionUsageSummary.model` (first/dominant, by count)       |
| `assistant.message.content[].type = "thinking"`      | `ReplayTurn.hasThinking = true`, `thinkingText` populated    |
| `assistant.message.content[].type = "tool_use"`      | `ReplayTurn.toolCalls[]` + increments `toolCounts[name]`     |
| `user.message.content[].type = "tool_result"`        | `ReplayTurn.toolResults[]` (content capped, default 2000 ch) |
| `system.subtype = "compact_boundary"`                | `SessionCompactionEvent` / `ReplayCompactionEvent`           |
| `system.compactMetadata.trigger`                     | → `"auto" \| "manual" \| "unknown"` (fallback)               |
| `system.compactMetadata.preTokens`                   | → `preTokens`                                                |
| `system.subtype = "turn_duration"`, `.durationMs`    | Attached to matching assistant turn via `parentUuid`         |
| `summary.summary`                                    | `ReplaySummaryEvent.summary`                                 |
| `gitBranch` (per line, excl. "HEAD")                 | First non-HEAD value → `SessionUsageSummary.gitBranch`       |
| `cwd` (per line)                                     | First non-null → `SessionUsageSummary.cwd` and project slug  |
| `version` (per line)                                 | First non-null → `SessionUsageSummary.version`               |

The pricing table + `estimateCostFromUsage` are ported verbatim (MIT) from
cc-lens (`Arindam200/cc-lens`) into `@control-plane/core`'s
`src/lib/pricing.ts`; per-turn `estimatedCostUsd` in `SessionTurnUsage` and
`ReplayTurn` uses that function.

## Extension points

- Additional runtimes (Codex, Hermes) should ship as sibling packages, not as
  branches inside this adapter.
- Sidechain/attachment normalization is intentionally out of scope until a UI
  module consumes it.
- An ingest-target adapter (persisting batches to storage) is a separate
  concern from this source adapter and lives with the storage package.

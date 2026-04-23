# 0002 — Agent-agnostic core + capability-based contracts

- **Status:** accepted
- **Date:** 2026-04-23
- **Deciders:** control-plane maintainers

## Context
Agent harnesses disagree about transcript shape, tool call semantics, pricing,
replay, MCP discovery, and runtime control. If UI modules branch on vendor
names (`if (runtime === "claude-code")`), every new adapter forks the UI.

## Decision
- `packages/core` owns canonical domain types (sessions, turns, tool calls,
  events, skills, channels, MCPs, tickets, replay frames, costs) with no
  vendor-specific field names.
- Adapters declare **capabilities** (`session-ingest`, `replay`,
  `runtime-control`, `pricing`, `mcp`, `channel`). UI modules ask
  `supports(adapter, capability)` and degrade gracefully when unsupported.
- Vendor-shaped detail is preserved in a generic `metadata` bag on the
  relevant entity, never promoted to a typed field.
- Runtime identity is carried by a generic `runtime` string; branches on that
  string are forbidden in rendered UI code.

## Consequences
- Adding a new adapter is additive: implement the contract, surface
  capabilities, done. No UI edits for the baseline experience.
- Vendor-specific affordances (e.g., Claude-only tool metadata) require either
  a new capability or a drill-down that reads `metadata` — neither is a
  shortcut through the canonical layer.
- `packages/core` evolves additively. Widening unions and adding optional
  fields is cheap; renames and removals are expensive and require
  coordination.

## Alternatives considered
- **Per-adapter UI slices.** Rejected — O(adapters × modules) UI surface,
  impossible to maintain.
- **Discriminated union on `runtime` throughout UI.** Rejected — same blast
  radius as per-adapter slices, just with more `switch` statements.

# Replay Module

The Replay module reconstructs what happened in a session from the
append-only event stream — ordered frames of turns, tool calls, and
domain events, with optional deterministic or live-adapter execution
modes. Phase 1 is deferred: the route at `apps/web/app/replay/page.tsx`
is a generic `ModulePage` placeholder and no replay adapter is wired
into the dashboard yet. Rationale:
[ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md).

## What's live today

- Nothing yet — see deferred scope. The sidebar entry is registered in
  `apps/web/lib/modules.ts` with `phase: "deferred"`.

## Canonical model

Types consumed from `@control-plane/core` (see
`packages/core/src/domain/replay.ts`):

- `ReplayRequest` — id, `ReplaySource` (`session` | `event_range` |
  `events`), `ReplayMode` (`dry_run` | `deterministic` |
  `live_adapters`), optional `adapterOverrides`.
- `ReplayFrame` — `{ sequence, at, event: DomainEventEnvelope, state? }`.
- `ReplayResult` — frames plus status
  (`succeeded` | `failed` | `cancelled`).
- `ReplayEvent` — the `replay.completed` envelope on the shared
  `DomainEvent` union (`packages/core/src/domain/events.ts`).

The adapter surface is defined in
`packages/core/src/contracts/replay-adapter.ts` (`ReplayAdapter.prepare`,
`replay`, optional `subscribeFrames`).

## Adapter capabilities

- Depends on `CONTROL_PLANE_CAPABILITIES.Replay` from
  `packages/core/src/capabilities.ts` (part of
  `AGENT_AGNOSTIC_CAPABILITIES`).
- Deterministic and live-adapter modes additionally require
  `CONTROL_PLANE_CAPABILITIES.SessionStreaming` on the target adapter;
  absence forces a `dry_run` only.
- Missing capability → UI degrades to an unavailable state per
  [ADR-0002](../architecture/decisions/0002-agent-agnostic-core.md).
  No branching on runtime name.

## Empty / degraded states

- No adapter advertises `replay` → `EmptyState`
  (`apps/web/components/ui/state.tsx`) explaining replay is
  unavailable.
- Capability present but `prepare` returns zero events → `EmptyState`
  "Nothing to replay".
- `prepare` or `replay` throws → `ErrorState` surfacing the adapter's
  typed failure message (per the typed-failures rule in
  [adapter-contracts.md](../architecture/adapter-contracts.md)).
- `subscribeFrames` unsupported → fall back to the completed
  `ReplayResult` frame list without a live indicator.

## Deliberately out of scope for Phase 1

Per [ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md):

- Any live `ReplayAdapter` wiring — the dashboard does not call
  `prepare` or `replay` in Phase 1.
- UI for selecting sources (session id, event cursor range, inline
  envelope list) and choosing `ReplayMode`.
- Adapter-override editor for `adapterOverrides`.
- Streaming frame subscription and live playback controls
  (play/pause/step).
- Side-by-side diff between an original session and a re-execution.
- Any projection that mutates the event stream — replay is derived,
  not persisted, per
  [ADR-0003](../architecture/decisions/0003-local-first-storage.md).

## Security notes

From [docs/architecture/security.md](../architecture/security.md):

- Replay inputs come from the append-only event stream; no in-place
  mutation or compaction is permitted in this phase.
- `live_adapters` mode can re-issue tool calls and channel sends —
  operators invoking it must be recorded in the audit stream, and any
  destructive tool must honour `requiresApproval` on its
  `ToolDescriptor` before re-execution.
- Operator-triggered replays are recorded as append-only audit
  entries.

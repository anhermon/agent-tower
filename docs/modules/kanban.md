# Kanban / Observability Module

The Kanban module is the ticket-centric view of work flowing through the
control plane — human- and (eventually) agent-created tickets with
their status, priority, assignee agent, and linked session. Phase 1 is
deferred: the route at `apps/web/app/kanban/page.tsx` is a generic
`ModulePage` placeholder and no ticket store exists yet. Rationale:
[ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md).

## What's live today

- Nothing yet — see deferred scope. The sidebar entry is wired via
  `apps/web/lib/modules.ts` with `phase: "deferred"` and points at this
  spec.

## Canonical model

Types consumed from `@control-plane/core` (see
`packages/core/src/domain/tickets.ts`):

- `TicketRecord` — id, title, `TicketStatus`
  (`open` | `in_progress` | `blocked` | `resolved` | `closed`),
  `TicketPriority` (`low` | `normal` | `high` | `urgent`), optional
  `assigneeAgentId`, `sessionId`, `externalUrl`.
- `TicketLink` — lightweight edge between a ticket and a `session` /
  `agent` / `tool_call` / `event` target.
- `TicketEvent` — the `ticket.changed` envelope on the shared
  `DomainEvent` union (`packages/core/src/domain/events.ts`).

## Adapter capabilities

- Depends on `CONTROL_PLANE_CAPABILITIES.Tickets` from
  `packages/core/src/capabilities.ts`.
- Tool-call drill-downs additionally rely on
  `CONTROL_PLANE_CAPABILITIES.ToolCalling`.
- Missing capability → board renders an unavailable state per
  [ADR-0002](../architecture/decisions/0002-agent-agnostic-core.md).

## Empty / degraded states

- No adapter advertises `tickets` → `EmptyState`
  (`apps/web/components/ui/state.tsx`) explaining the capability is
  unavailable.
- Capability present but no tickets exist → `EmptyState` inviting the
  operator to configure a ticket source.
- Source throws → `ErrorState` surfacing the error message.

## Deliberately out of scope for Phase 1

Per [ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md):

- Ticket CRUD (create/edit/close) and any persistence — tickets must
  live behind the `packages/storage` repository boundary before UI
  writes are allowed
  ([ADR-0003](../architecture/decisions/0003-local-first-storage.md)).
- Agent-created tickets (agents emitting `ticket.changed` into the
  event stream).
- Runtime control from the board (start/pause/stop agents assigned to
  a ticket).
- Reasoning audit trail view and tool-call tracing panel.
- External ticket-system sync (Jira/Linear/GitHub Issues).
- Lane customization, WIP limits, and drag-and-drop reordering.

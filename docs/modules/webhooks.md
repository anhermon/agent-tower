# Webhooks Module

The Webhooks module manages inbound event endpoints, local integration design,
dry-run trigger testing, and delivery observability for the control plane. The
current phase is webhook-first: registration and routing can be exercised
without spending agent tokens, while agent handoff remains a disabled Phase 2
target.

## What's live today

- `/webhooks` loads `CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE`, renders configured
  `WebhookSubscription[]`, joins local GitHub delivery JSONL records, and hosts
  the embedded integration workbench.
- `/webhooks/standalone` renders the workbench without the full control-plane
  sidebar/topbar so the module can be refined independently.
- `POST /api/webhooks/github` verifies GitHub HMAC signatures and appends
  accepted delivery records to the local JSONL log.
- The workbench supports GitHub, Slack, and Email provider catalogs, event
  selection, route-mode selection, local test triggers, filters, timelines, and
  drilldown. Slack and Email receivers are catalog/planning entries only.

## Canonical model

Types consumed from `@control-plane/core` (see
`packages/core/src/domain/webhooks.ts`):

- `WebhookSubscription` — id, url, enabled flag, `secretRef`, and the
  `WebhookEventType[]` it listens for.
- `WebhookDelivery` — one delivery attempt with `status`
  (`pending` | `delivered` | `failed`), response status/body, and
  request headers.
- `WEBHOOK_EVENT_TYPES` — canonical event-type enum
  (`agent.changed`, `session.changed`, `session.turn_created`,
  `tool_call.changed`, `cost.recorded`, `ticket.changed`,
  `replay.completed`).
- `WebhookEvent` — the `webhook.delivery_changed` envelope on the
  shared `DomainEvent` union (`packages/core/src/domain/events.ts`).

## Adapter capabilities

- Depends on `CONTROL_PLANE_CAPABILITIES.Webhooks` from
  `packages/core/src/capabilities.ts`.
- Missing capability → UI degrades to an unavailable state per
  [ADR-0002](../architecture/decisions/0002-agent-agnostic-core.md).
  No branching on adapter/runtime names.

## Empty / degraded states

- No subscriptions configured → `EmptyState` (`apps/web/components/ui/state.tsx`)
  pointing at configuration guidance.
- Adapter does not advertise `webhooks` capability → `EmptyState` that
  explains the capability is unavailable.
- Underlying source throws → `ErrorState` surfacing the error message.

## Deliberately out of scope for the current phase

- Durable webhook CRUD persistence. The workbench uses local client state for
  UX validation.
- Delivery retry policy and backoff scheduling.
- Outbound fan-out from `DomainEvent` to external URLs.
- Agent session execution and prompt dispatch from webhook triggers.
- Event-to-agent traceability. The UI stops at event-to-processing-route
  drilldown until Phase 2 connects agents.
- Secret storage backend (Phase 1 only names a `secretRef`).

## Known hardening work

- Publish a canonical `webhook.received` event after receiver validation instead
  of only appending a delivery projection.
- Add idempotency around provider delivery IDs.
- Reject or explicitly classify unsupported provider events rather than mapping
  them to a misleading canonical event type.
- Add event-specific GitHub payload schemas before workflow execution is wired.

## Security notes

From [docs/architecture/security.md](../architecture/security.md):

- Webhook secrets must be stored separately from display configuration.
- Every external payload is validated at the adapter/API boundary.
- Sender allowlists gate external sources before any agent session
  injection.
- Operator and automated actions on subscriptions are recorded in the
  append-only audit stream.

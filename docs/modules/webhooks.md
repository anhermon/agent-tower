# Webhooks Module

The Webhooks module manages inbound event endpoints and outbound delivery
history for the control plane. Phase 1 is deferred: the route is a
placeholder (`apps/web/app/webhooks/page.tsx` renders the generic
`ModulePage` shell) and no real subscriptions, deliveries, or signature
verification exist yet. The canonical types are defined so later slices
can light up without churning the domain. Rationale:
[ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md).

## What's live today

- Nothing yet — see deferred scope. The route exists only to keep the
  sidebar entry from 404'ing; the module registry marks it
  `phase: "deferred"` in `apps/web/lib/modules.ts`.

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

## Deliberately out of scope for Phase 1

Per [ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md):

- Webhook CRUD (create/edit/delete subscriptions) and persistence.
- Delivery retry policy and backoff scheduling.
- Real HMAC/signature verification of inbound payloads — see
  [security notes](../architecture/security.md).
- Outbound fan-out from `DomainEvent` to external URLs.
- Event-to-session traceability UI.
- Secret storage backend (Phase 1 only names a `secretRef`).

## Security notes

From [docs/architecture/security.md](../architecture/security.md):

- Webhook secrets must be stored separately from display configuration.
- Every external payload is validated at the adapter/API boundary.
- Sender allowlists gate external sources before any agent session
  injection.
- Operator and automated actions on subscriptions are recorded in the
  append-only audit stream.

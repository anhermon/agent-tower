# Webhooks module — local contract

This directory owns the `/webhooks` and `/webhooks/[id]` routes. It is the
UI half of the Webhooks module; the data half lives in
`apps/web/lib/webhooks-source.ts` and the rendered atoms live in
`apps/web/components/webhooks/`.

## Boundary

- **Canonical types only.** Components consume `WebhookSubscription` /
  `WebhookDelivery` / `WebhookEventType` from `@control-plane/core`. Do
  not introduce vendor-specific webhook shapes into the rendered tree and
  do not branch on adapter names.
- **Server-only filesystem access.** Only server components and server
  modules (`page.tsx`, `lib/webhooks-source.ts`) may touch `node:fs` or
  read the configured JSON file. Client components receive plain
  serializable props.
- **Read-only.** No writes, no network, no mutations. No POST/PUT/DELETE
  handlers live here. Subscription CRUD is deferred past Phase 2 v1.
- **No inbound receiver.** The inbound webhook endpoint, HMAC/signature
  verification, and the outbound fan-out from `DomainEvent` are
  deferred — see `docs/architecture/security.md` and
  `docs/modules/webhooks.md`. If you find yourself adding a route that
  accepts inbound POSTs, stop and plan it as a separate Phase 3 slice.

## Routing

- `page.tsx` — subscription list + summary strip + empty/error states.
- `[id]/page.tsx` — per-subscription detail keyed on the canonical
  `WebhookSubscription.id`. The id in the URL is `encodeURIComponent`-
  encoded when rendered and `decodeURIComponent`-decoded on the server.

## Configuration

- Source of truth: `CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE` environment
  variable pointing at a JSON file of `WebhookSubscription[]`.
- No default location — unset means unconfigured. `webhooks-source.ts`
  returns `{ ok: false, reason: "unconfigured" }` and the UI renders
  `EmptyState` rather than fabricating subscriptions.

## Deliberately out of scope for this slice

Do **not** add any of the following to this directory until the next
slice of the module is planned:

- CRUD on webhook subscriptions (create/edit/delete/test-fire through the
  UI).
- HMAC/signature verification — keep this out entirely until the inbound
  receiver lands so the signing code path is not half-implemented.
- Secret values in the UI: only `secretRef` is surfaced. Reading or
  writing the secret value is not allowed here.
- Retry/backoff configuration.
- Real delivery ingestion — `deliveries` is derived from the snapshot
  and currently always empty; render the empty state honestly.

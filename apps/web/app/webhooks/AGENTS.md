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
- **Read-only (this directory).** No writes, no network, no mutations
  originating from the `/webhooks` UI routes. Subscription CRUD is deferred
  past Phase 2 v1.
- **Inbound receiver is live.** `app/api/webhooks/github/route.ts` is the
  inbound GitHub webhook endpoint. It validates headers and HMAC-SHA256
  signature (`lib/webhook-verifier.ts`), persists deliveries to the JSONL
  log (`lib/github-webhooks.ts`), and publishes a `WebhookReceived` event to
  the internal event bus (`lib/event-bus.ts`). Do not duplicate this logic
  here; do not add a second POST handler under `/webhooks`.

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
- Secret values in the UI: only `secretRef` is surfaced. Reading or
  writing the secret value is not allowed here.
- Retry/backoff configuration.
- Real delivery ingestion — `deliveries` is derived from the snapshot
  and currently always empty; render the empty state honestly.

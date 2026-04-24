# Webhooks module — local contract

This directory owns the `/webhooks`, `/webhooks/[id]`, and
`/webhooks/standalone` routes. It is the UI half of the Webhooks module; the
data half lives in `apps/web/lib/webhooks-source.ts`, module-local workbench
code lives in `_module/`, and rendered shared atoms live in
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
- **Local workbench only.** `_module/` may provide client-side registration,
  route design, and dry-run trigger state so the UX can be tested without
  spending agent tokens. This state is intentionally local and must not be
  described as durable production configuration.
- **No agent execution.** The workbench can route to store/queue/local dry-run
  processing modes only. Agent handoff remains a disabled Phase 2 target until
  webhook integration and observability are robust.
- **Inbound receiver lives outside this route subtree.** The GitHub receiver is
  `apps/web/app/api/webhooks/github/route.ts`; keep HMAC verification and
  persistence there or in server helpers.

## Routing

- `page.tsx` — subscription list + summary strip + empty/error states.
- `[id]/page.tsx` — per-subscription detail keyed on the canonical
  `WebhookSubscription.id`. The id in the URL is `encodeURIComponent`-
  encoded when rendered and `decodeURIComponent`-decoded on the server.
- `standalone/page.tsx` — workbench-only render for visual/functionality
  iteration without the full control-plane shell.
- `_module/` — client-side workbench model, provider catalog, and UI.

## Configuration

- Source of truth: `CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE` environment
  variable pointing at a JSON file of `WebhookSubscription[]`.
- No default location — unset means unconfigured. `webhooks-source.ts`
  returns `{ ok: false, reason: "unconfigured" }` and the UI renders
  `EmptyState` rather than fabricating subscriptions.

## Deliberately out of scope for this slice

Do **not** add any of the following to this directory until the next
slice of the module is planned:

- Durable CRUD on webhook subscriptions (create/edit/delete persisted beyond
  local browser state).
- Secret values in the UI: only `secretRef` is surfaced. Reading or
  writing the secret value is not allowed here.
- Retry/backoff configuration.
- Agent execution or prompt dispatch from webhook triggers.

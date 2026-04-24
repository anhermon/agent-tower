# Webhooks Module

The Webhooks module shows inbound webhook subscriptions and invocation history for the control plane.
The module is wired to the local GitHub inbound receiver (`POST /api/webhooks/github`) and reads
real delivery logs from disk.

## What's live today

- Subscription overview from `CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE`.
- Active/paused status summary.
- Invocation log fed from `CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_DELIVERIES_FILE`
  (or `.claude/github-webhook-deliveries.jsonl` by default).
- Session linkage from invocation metadata (`metadata.sessionId`) to `/sessions/[id]`.
- GitHub webhook setup helper at `scripts/github/setup-webhook.mjs` (`task github:webhook:create`).

## Infrastructure dependencies

### Redis (for workflow engine)

The webhook workflow engine uses [BullMQ](https://docs.bullmq.io/) for reliable job queuing and background
action execution. BullMQ requires a Redis instance.

**Connection:** Configure via the standard `REDIS_URL` environment variable. Defaults to `redis://localhost:6379`.

**Required for:**
- Enqueuing webhook-triggered workflow jobs (`workflow-queue.ts`)
- Background worker that executes configured actions (`workflow-worker.ts`)

**Without Redis:** The workflow engine will fail to start and webhook-triggered actions will not execute.
The inbound receiver (`POST /api/webhooks/github`) will still accept and persist deliveries, but no
automated actions (e.g., PR review, issue creation) will run.

**Dev setup:** Redis is available via `docker run -d -p 6379:6379 redis:7-alpine` or Homebrew (`brew install redis`).

## Provider-agnostic webhook verification

Webhook signatures are verified through a provider-agnostic interface (`apps/web/lib/webhook-verifier.ts`).
Supported providers out of the box:

- **GitHub** — HMAC-SHA256 (`x-hub-signature-256`)
- **Slack** — HMAC-SHA256 with timestamp (`x-slack-signature` + `x-slack-request-timestamp`)
- **Stripe** — HMAC-SHA256 (`stripe-signature`)

Additional providers can be registered via `registerWebhookVerifier(provider, verifier)`.

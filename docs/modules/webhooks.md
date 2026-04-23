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

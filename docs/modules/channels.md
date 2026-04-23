# Channels Module

The Channels module is the inbound/outbound message surface — web,
Slack, email, CLI, API, and internal — that routes external events
into agent sessions and delivers agent output back out. Phase 1 is
deferred: the route at `apps/web/app/channels/page.tsx` is a generic
`ModulePage` placeholder and no channel adapter is wired into the
dashboard yet. Rationale:
[ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md).

## What's live today

- Nothing yet — see deferred scope. The sidebar entry is registered in
  `apps/web/lib/modules.ts` with `phase: "deferred"`.

## Canonical model

Types consumed from `@control-plane/core` (see
`packages/core/src/domain/channels.ts`):

- `ChannelRef` — `{ kind: ChannelKind, id }` where `ChannelKind` is
  `web` | `slack` | `email` | `api` | `cli` | `internal`.
- `ChannelIdentity` — canonical sender shape with optional
  `externalUserId` (load-bearing for allowlisting).
- `ChannelMessage` — direction (`inbound` | `outbound`), sender,
  optional text/payload, `threadId`, `correlationId`.
- `ChannelBinding` — pairs a `ChannelRef` with an `agentId` /
  `sessionId` for routing.

The adapter surface is defined in
`packages/core/src/contracts/channel-adapter.ts`
(`ChannelAdapter.bind`, `send`, `subscribe`).

## Adapter capabilities

- Depends on `CONTROL_PLANE_CAPABILITIES.ChannelIngress` and
  `CONTROL_PLANE_CAPABILITIES.ChannelEgress` from
  `packages/core/src/capabilities.ts`. Both are part of
  `AGENT_AGNOSTIC_CAPABILITIES`.
- Ingress missing → inbound history and live subscription UI degrade.
- Egress missing → outbound send UI is hidden/disabled.
- Degradation rules follow
  [ADR-0002](../architecture/decisions/0002-agent-agnostic-core.md); no
  branching on vendor/runtime name.

## Empty / degraded states

- No adapter advertises either channel capability → `EmptyState`
  (`apps/web/components/ui/state.tsx`) explaining channels are
  unavailable.
- Capability present but no bindings configured → `EmptyState`
  inviting the operator to bind a channel.
- Ingress present but subscription fails → `ErrorState` with the
  adapter's typed failure message.

## Deliberately out of scope for Phase 1

Per [ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md):

- Real `ChannelAdapter` implementations for Slack, Discord, WhatsApp,
  Telegram, GitHub, Bitbucket, or Jira.
- External credential storage for any provider.
- Sender allowlisting configuration and enforcement — see
  [security notes](../architecture/security.md); this is a hard
  prerequisite before any inbound channel is allowed to inject into a
  session.
- Bidirectional session mapping UI (inbound message → session / thread
  resolution) beyond the `correlationId` field on `ChannelMessage`.
- Outbound send composer and rate-limit handling.
- Cross-channel fan-out and routing rules.

## Security notes

From [docs/architecture/security.md](../architecture/security.md):

- Inbound channel text is untrusted input; validate at the adapter
  boundary.
- Sender allowlists MUST gate external chat and webhook sources before
  injection into any agent session.
- Claude Code channels can push webhooks, alerts, and chat messages
  into a session via MCP notifications; ungated channels are
  prompt-injection vectors, so any channel adapter must verify sender
  identity before forwarding events.
- Channel configuration writes are recorded in the append-only audit
  stream.

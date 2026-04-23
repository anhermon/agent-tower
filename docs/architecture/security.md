# Security Notes

The control plane receives high-trust inputs: local session logs, tool outputs, webhooks, channel messages, and potentially remote chat events.

## Baseline Rules

- Default to loopback/local-only development.
- Require explicit filesystem roots for local log readers.
- Validate every external payload at the adapter/API boundary.
- Store webhook secrets separately from display configuration.
- Treat inbound channel text as untrusted input.
- Sender allowlists must gate external chat and webhook sources before they are injected into any agent session.
- Record operator actions and automated actions in an append-only audit stream.

## Claude Channels

Claude Code channels can push webhooks, alerts, and chat messages into a Claude session through MCP notifications. Ungated channels are prompt-injection vectors, so any channel adapter must verify sender identity before forwarding events.

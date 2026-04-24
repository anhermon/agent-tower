# Architecture Overview

The Modular Agents Control Plane is a local-first operational dashboard for multiple AI agent harnesses. Phase 1 establishes the skeleton that later modules plug into.

## Product Intent

The control plane is a one-stop shop for agent-harness observability, control, and diagnostics. The canonical development path:

1. **Claude Code first** — the adapter-claude-code package is the initial real ingestion target. All domain types and adapter contracts are designed so any harness can plug in.
2. **Additional harnesses** — each new harness gets its own adapter package (`packages/adapter-<name>`) implementing the same capability contracts from `@control-plane/core`. The UI never branches on harness identity.
3. **Token optimization tooling** — a curated surface of optimization primitives (RTK query deduplication, context-mode toggling, cache efficiency tuning) with one-click integration options exposed in the dashboard. The Sessions and Skills modules are the primary data sources.
4. **Token usage analysis** — deep analysis of where tokens are spent: tool overhead, skill injection volume, cache miss rates, waste scoring. Built on top of `cp sessions waste` and the adapter analytics pipeline.
5. **Kanban / agent steering** — a ticket board that can receive agent-created tickets, allow human operators to steer work (assign, reprioritize, block), and surface session correlation. Inspired by the task boards in Paperclip, Cline, and agent-dashboard. Planned for Phase 3+.
6. **Webhook workflows** — event-driven pipelines that turn inbound events (GitHub PRs, CI failures, issue comments) into agent-executed actions. The workflow engine subscribes to `WebhookReceived` events, matches repo-configured rules, and dispatches jobs to a worker. See `docs/superpowers/specs/2026-04-24-webhook-agent-workflow-design.md`.

## Design Principles

- **Agent-agnostic core:** Claude Code is the first adapter target, but the core model describes sessions, turns, events, tools, costs, skills, channels, MCP servers, and tickets without relying on Claude-specific field names.
- **Capability-based UI:** Modules ask whether an adapter supports a capability, such as replay, event injection, runtime control, or MCP discovery.
- **Isolated modules:** Each module owns its route, UI, service boundary, adapter contract, and tests.
- **Local-first storage:** The default posture is local data and explicit filesystem roots. Hosted sync can be added later behind a storage provider boundary.
- **Append-only auditability:** Incoming events, agent actions, and operator actions should be represented as immutable audit entries before higher-level projections are built.

## Phase Roadmap

| Phase | Focus | Key deliverables |
|-------|-------|-----------------|
| 1 | Skeleton | Shell, canonical types, adapter contracts, placeholder routes, mock event stream |
| 2 | Real ingestion | Claude Code JSONL adapter live, Sessions/Skills/Agents/Webhooks modules with real data, CI gates |
| 3 | Workflow engine | GitHub webhook → rule matcher → job queue → worker → GitHub API actions |
| 3 | Token optimization | Waste analysis UI, per-tool token overhead, cache efficiency panel, RTK/context-mode integration guides |
| 4 | Agent steering | Kanban board with session correlation, human-in-the-loop controls, agent-created tickets |
| 4 | Additional adapters | BitBucket webhooks, Cline/Cursor adapter stubs |
| 5 | Hosted sync | Storage provider boundary wired to a cloud backend, multi-device |

## Current Phase (2 → 3)

Phase 2 is functionally complete: the Claude Code adapter is live, all active modules serve real data, and the CI gate enforces quality. Active development is entering Phase 3 with the webhook workflow engine.

Phase 2 does not include: webhook CRUD UI, persistent job queues (SQLite), external channel credentials, live process control, or agent-created tickets.

## Module Status

| Module | Phase | Status | Notes |
|--------|-------|--------|-------|
| Sessions | 2 | active | Full analytics: overview, costs, activity, tools, per-turn timeline |
| Agents | 2 | active | Inventory from filesystem metadata, status derived from transcript activity |
| Skills | 2 | active | Registry + usage telemetry + session-outcome efficacy |
| Webhooks | 2→3 | active | Subscription list; GitHub receiver live; workflow engine in progress |
| Kanban | 2 | active | Read-only file-backed ticket board |
| MCPs | deferred | degraded | Placeholder route; discovery from `.mcp.json` planned |
| Channels | deferred | degraded | Placeholder route; Slack/email adapters planned |
| Replay | deferred | degraded | Placeholder route; deterministic replay planned |

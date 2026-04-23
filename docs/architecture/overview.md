# Architecture Overview

The Modular Agents Control Plane is a local-first operational dashboard for multiple AI agent harnesses. Phase 1 establishes the skeleton that later modules plug into.

## Design Principles

- **Agent-agnostic core:** Claude Code is the first adapter target, but the core model describes sessions, turns, events, tools, costs, skills, channels, MCP servers, and tickets without relying on Claude-specific field names.
- **Capability-based UI:** Modules ask whether an adapter supports a capability, such as replay, event injection, runtime control, or MCP discovery.
- **Isolated modules:** Each module owns its route, UI, service boundary, adapter contract, and tests.
- **Local-first storage:** The default posture is local data and explicit filesystem roots. Hosted sync can be added later behind a storage provider boundary.
- **Append-only auditability:** Incoming events, agent actions, and operator actions should be represented as immutable audit entries before higher-level projections are built.

## Phase 1 Scope

Phase 1 includes the dashboard shell, reusable UI primitives, canonical contracts, empty dashboard states, a non-fabricating event stream endpoint, storage abstractions, and placeholder module routes.

Phase 1 does not include real Claude Code ingestion, webhook CRUD persistence, external channel credentials, or live process control.

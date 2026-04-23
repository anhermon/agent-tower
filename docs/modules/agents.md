# Agents Module

The Agents module is the agent inventory + runtime-activity view of the
control plane. Phase 1 is strictly read-only and agent-agnostic at the UI
boundary — the only agent-specific logic lives in the Claude Code adapter.

## What's live today

- **Discovery from adapter.** The module consumes
  `@control-plane/adapter-claude-code` via `apps/web/lib/agents-source.ts`.
  Each project directory under the configured data root
  (`CLAUDE_CONTROL_PLANE_DATA_ROOT` or `~/.claude/projects`) is treated as
  one Claude Code agent instance scoped to that cwd.
- **Canonical types.** The UI only sees canonical
  `AgentDescriptor` / `AgentState` values from
  `@control-plane/core`. Runtime identity is carried in
  `descriptor.runtime` (e.g. `"claude"`) — the UI never hard-codes a
  vendor name.
- **Derivation rules** (server-side, from filesystem metadata):
  - `descriptor.id` — `claude-code:<projectId>` (URL-safe, stable).
  - `descriptor.runtime` — `AGENT_RUNTIMES.Claude`.
  - `descriptor.kind` — `AGENT_KINDS.Interactive`.
  - `descriptor.displayName` — the project folder name, decoded from the
    Claude-Code encoding (leading `-` → `/`, doubled `--` → literal `-`,
    remaining `-` → `/`). The raw id is preserved under
    `descriptor.metadata.projectId`.
  - `descriptor.capabilities` — `CLAUDE_FIRST_CAPABILITIES`.
  - `state.status` — derived from the most recent transcript mtime:
    `available` if within 1 hour, `busy` if within 24 hours, `offline`
    otherwise (or if no sessions exist).
  - `state.activeSessionIds` — session ids with mtime within the last hour.
  - `state.lastSeenAt` — most recent transcript mtime.
- **Routes.**
  - `GET /agents` — inventory grid with search, status chips, and
    sort-by-column controls, plus a summary strip (total / available /
    busy / offline).
  - `GET /agents/[id]` — per-agent detail: canonical descriptor header,
    derived state badge, aggregate counts, and a session list that
    cross-links into the Sessions module (`/sessions/[id]`).
- **Caching.** In-process inventory cache keyed on the resolved data
  root plus a signature of the session listing aggregate, so repeated
  renders in the same Node process are cheap. The state timestamps are
  re-derived against the current clock on every cache hit so status
  ages correctly between requests.

## Empty / degraded states

- No `CLAUDE_CONTROL_PLANE_DATA_ROOT` and no `~/.claude/projects` →
  `"No agent runtimes"` empty state referring to the env var.
- Data root resolved but contains no transcripts → same title, copy
  clarifies that no agents have been discovered yet.
- Adapter throws → `ErrorState` with the underlying message.

## Deliberately out of scope for this slice

Phase 1 of the Agents module is **pure inventory + observability**. The
following are intentional future work and must not be added here yet:

- CRUD of agent instances (create/rename/delete).
- Runtime control (start/stop/restart/kill, task injection).
- Skill assignment, MCP assignment, webhooks wiring.
- Heartbeat ingestion — state is derived from transcript activity only.
- Queue depth / load metrics — the adapter does not expose them yet.
- Multi-adapter fan-out — currently only Claude Code instances are
  discovered; the boundary is ready for additional adapters without UI
  changes.

See `apps/web/app/agents/AGENTS.md` for the module-local contract that
keeps the UI agent-agnostic.

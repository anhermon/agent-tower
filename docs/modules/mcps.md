# MCPs Module

The MCPs module surfaces the MCP (Model Context Protocol) servers an
adapter knows about — their transport, connection status, advertised
tools, and resources. Phase 1 is deferred: the route at
`apps/web/app/mcps/page.tsx` is a generic `ModulePage` placeholder and
no MCP adapter is wired into the dashboard yet. Rationale:
[ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md).

## What's live today

- Nothing yet — see deferred scope. The sidebar entry is registered in
  `apps/web/lib/modules.ts` with `phase: "deferred"`.

## Canonical model

Types consumed from `@control-plane/core` (see
`packages/core/src/domain/mcps.ts`):

- `McpServerDescriptor` — id, name, `McpServerStatus`
  (`unknown` | `connecting` | `connected` | `disconnected` | `error`),
  `McpTransport` (stdio or http), and advertised capabilities.
- `McpTransport` — `{ kind: "stdio", command, args? }` or
  `{ kind: "http", url, headers? }`.
- `McpToolDescriptor` — extends `ToolDescriptor` with `serverId`.
- `McpResourceDescriptor` / `McpResourceContent` — resource listing and
  dereferenced content.
- `McpEvent` — the `mcp.server_changed` envelope on the shared
  `DomainEvent` union (`packages/core/src/domain/events.ts`).

The adapter surface is defined in
`packages/core/src/contracts/mcp-adapter.ts` (`McpAdapter.describeServer`,
`listTools`, `callTool`, `listResources`, `readResource`).

## Adapter capabilities

- Depends on `CONTROL_PLANE_CAPABILITIES.McpClient` from
  `packages/core/src/capabilities.ts` (part of
  `CLAUDE_FIRST_CAPABILITIES`).
- Tool invocation drill-downs additionally rely on
  `CONTROL_PLANE_CAPABILITIES.ToolCalling`.
- Missing capability → UI degrades to an unavailable state per
  [ADR-0002](../architecture/decisions/0002-agent-agnostic-core.md).
  No branching on runtime name.

## Empty / degraded states

- No adapter advertises `mcp.client` → `EmptyState`
  (`apps/web/components/ui/state.tsx`) explaining the capability is
  unavailable.
- Adapter present but `listTools` returns empty → `EmptyState` naming
  the adapter and suggesting the server is idle.
- Any `McpAdapter` call throws → `ErrorState` with the returned
  adapter-error message (per the typed-failures rule in
  [adapter-contracts.md](../architecture/adapter-contracts.md)).
- Servers in status `disconnected` / `error` should render inline
  status chips rather than hiding the row.

## Deliberately out of scope for Phase 1

Per [ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md):

- Any live MCP adapter wiring — the dashboard does not call
  `McpAdapter` methods in Phase 1.
- Server CRUD (add/edit/remove stdio or http transports) and secret
  storage for http headers.
- Tool invocation from the UI (`callTool`) and resource reads
  (`readResource`).
- Routing rules from sessions to MCP servers.
- Health polling and reconnect scheduling.
- Cross-adapter MCP aggregation — Phase 1 only targets a single
  adapter surface.

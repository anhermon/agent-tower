# MCPs module — local contract

This directory owns the `/mcps` route. It is the UI half of the MCPs
module; the data half lives in `apps/web/lib/mcps-source.ts`. No
module-specific presentational components exist yet (`components/mcps/`
is intentionally absent in Phase 1 — the placeholder uses shared layout).

## Boundary

- **Canonical types only.** Once active, components must consume
  `McpServerDescriptor`, `McpToolDescriptor`, and `McpTransport` from
  `@control-plane/core`. Do not import adapter- or vendor-specific shapes
  into the rendered tree.
- **Capability-gated, not vendor-branched.** Check for
  `CONTROL_PLANE_CAPABILITIES.McpClient` before calling any adapter
  method. Never branch on runtime name.
- **Server-only filesystem / adapter access.** Only `page.tsx` and
  `lib/mcps-source.ts` may touch adapters. Any future client components
  under `components/mcps/` receive plain serializable props.
- **Read-only.** No writes, mutations, CRUD routes, or network calls live
  here.

## Routing

- `page.tsx` — server component; calls `listMcpServers()` from
  `lib/mcps-source.ts`, switches on the result, and renders either the
  populated module or the appropriate empty/error state.

## Deliberately out of scope for Phase 1

Per [ADR-0001](../../../../docs/architecture/decisions/0001-phase-1-skeleton.md)
and [docs/modules/mcps.md](../../../../docs/modules/mcps.md):

- Any live `McpAdapter` wiring — the dashboard does not call `McpAdapter`
  methods in Phase 1.
- Server CRUD (add/edit/remove stdio or http transports) and secret
  storage for http headers.
- Tool invocation from the UI (`callTool`) and resource reads
  (`readResource`).
- Routing rules from sessions to MCP servers.
- Health polling and reconnect scheduling.
- Cross-adapter MCP aggregation.

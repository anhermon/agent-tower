# packages/mcp-server — Index

## Responsibility
- Stdio Model Context Protocol server (`control-plane-mcp`) exposing the same read-only analytics as the CLI and web dashboard, as typed MCP tools for LLM agents.
- Thin wrapper: tool handlers call into `@control-plane/adapter-claude-code` exactly like `packages/cli` does. No business logic lives here.
- **Does not** write, mutate, or reach the network beyond the stdio channel.

## Read First
- `README.md` — installation, launch, `.mcp.json` registration.
- `src/server.ts` — stdio transport + tool registry bootstrap.
- `src/index.ts` — library entry (tests import from here; the binary is `server.ts`).
- `src/tools/*.ts` — one file per MCP tool (1:1 with CLI subcommands).
- `src/tools/types.ts` — shared result envelope + JSON-schema helpers.

## Tools exposed
`control_plane_health`, `sessions_top`, `sessions_show`, `skills_top`, `skills_usage`, `skills_efficacy`, `agents_list`. Each has a `*.ts` + `*.test.ts` pair.

## Entry Points / Flow
stdio → `@modelcontextprotocol/sdk` server in `server.ts` → dispatches to `tools/<name>.handler` → tool handler imports adapter functions → returns `{ok, value | reason, message?}` → SDK serializes to the MCP response.

## Dependencies
- Consumes: `@control-plane/core`, `@control-plane/adapter-claude-code`, `@modelcontextprotocol/sdk`.
- Registered via `.mcp.json` at the repo root.
- Published binary: `control-plane-mcp` → `dist/server.js`.

## Local Conventions
- **Never throw.** Every tool returns a result envelope `{ok:false, reason, message?}` on failure — MCP errors surface as typed results, not exceptions, so the client keeps the session alive.
- **1:1 parity with the CLI.** New capability? Add the command in `packages/cli` and the tool here in the same commit. Divergence is a bug.
- **Tool schemas are source of truth.** Update the JSON-schema in each `tools/<name>.ts` alongside the handler; the SDK generates the tool manifest from these.

## Sharp Edges
- `pnpm --filter @control-plane/mcp-server build` must run once before clients can spawn the binary. Re-run after any source change.
- The `@modelcontextprotocol/sdk` version is pinned (no caret). Bumping it may require handler signature changes — do not bump without reviewing the SDK changelog.
- Analytics cache is per-process; one long-running MCP session amortizes file scans across tool calls (unlike `cp`). Clients that spawn a fresh process per request lose that benefit.

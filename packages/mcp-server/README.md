# @control-plane/mcp-server

Read-only stdio MCP server that exposes the control-plane's analytics surface to MCP-compatible clients. Depends on `@modelcontextprotocol/sdk` (locked to `1.29.0`). Register in `.mcp.json` with `{ "command": "node", "args": ["packages/mcp-server/dist/server.js"] }` or via the `control-plane-mcp` bin.

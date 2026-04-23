# Sessions Module

Phase 1 only provides a placeholder route with empty states until a real session ingest adapter is connected. The future implementation should be a strict superset of `cc-lens` session and token analysis features.

Required future surfaces:

- overview metrics
- project drill-downs
- session replay
- token and cost analysis
- tool usage
- MCP usage
- local Claude files
- export/import preview

Add a module-local `AGENTS.md` when implementation begins.

## Adapters

- `@control-plane/adapter-claude-code` — read-only source adapter that
  normalizes local Claude Code JSONL transcripts into canonical sessions,
  turns, tool calls, and tool results. See
  `packages/adapter-claude-code/AGENTS.md`.

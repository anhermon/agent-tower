# Data Model

The canonical model is optimized around replayable work:

- **Agent type:** a vendor/runtime family such as Claude Code, Codex, Gemini, Hermes, Cursor, OpenCode, or a custom local runner.
- **Agent instance:** one configured runtime with status, heartbeat, capabilities, tools, skills, MCPs, and context files.
- **Session:** a bounded unit of agent work.
- **Turn:** a user, assistant, system, tool, or event step inside a session.
- **Tool call:** a normalized invocation and result pair.
- **Event:** an external or internal signal such as webhook receipt, channel message, status transition, or operator action.
- **Replay frame:** the UI-level reconstruction of what happened and when.
- **Ticket:** a human or agent-created task used by Kanban/observability.

Raw adapter metadata should be preserved under explicit metadata fields, but core workflows should use normalized fields.

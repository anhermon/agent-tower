# Agents module — local contract

This directory owns the `/agents` and `/agents/[id]` routes. It is the
UI half of the Agents module; the data half lives in
`apps/web/lib/agents-source.ts` and the rendered atoms live in
`apps/web/components/agents/`.

## Boundary

- **Canonical types only.** Components consume
  `AgentDescriptor` / `AgentState` / `AgentStatus` from
  `@control-plane/core`. Do not import Claude-specific types into the
  rendered tree and do not branch on vendor names. Runtime identity is
  the `descriptor.runtime` field.
- **Server-only filesystem access.** Only server components and server
  modules (`page.tsx`, `lib/agents-source.ts`) may touch
  `node:fs` / the adapter. Client components (`AgentGrid`) receive
  plain data via props.
- **Read-only.** No writes, no network, no mutations. No POST/PUT/DELETE
  handlers live here.
- **Cross-module linking is a one-way arrow.** Agent detail pages link
  into `/sessions/[id]`. The Sessions module must not import anything
  from this directory.

## Routing

- `page.tsx` — inventory grid + summary strip + empty/error states.
- `[id]/page.tsx` — per-agent detail keyed on the canonical descriptor
  id. The id in the URL is `encodeURIComponent`-encoded when rendered
  and `decodeURIComponent`-decoded on the server.

## Derivation rules (summary)

All derivation lives in `lib/agents-source.ts`. See
`docs/modules/agents.md` for the full rule list. Do not duplicate this
logic in a component.

## Deliberately out of scope for this slice

Do **not** add any of the following to this directory until the next
slice of the module is planned:

- CRUD on agent instances.
- Runtime control actions (start/stop/restart, task injection).
- Skill assignment, MCP assignment, context file editors
  (`AGENTS.md`/`SOUL.md`/`HEARTBEAT.md` editors).
- Heartbeat ingestion endpoints. State is derived from transcript
  activity only.
- Multi-adapter selector UI. Additional adapters should extend
  `agents-source.ts` server-side and appear in the same canonical list.

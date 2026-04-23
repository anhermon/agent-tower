# 0003 — Local-first storage, explicit filesystem roots

- **Status:** accepted
- **Date:** 2026-04-23
- **Deciders:** control-plane maintainers

## Context
Agent transcripts, sessions, and audit events often sit on the operator's
machine (e.g., `~/.claude/projects/...` for Claude Code). The control plane
needs to read them without inheriting vendor-specific default paths or
requiring cloud state. It must also evolve to a persistent/hosted backend
without rewriting repository consumers.

## Decision
- Default posture is **local data**. Phase 1 uses in-memory storage
  (`packages/storage/src/in-memory.ts`) and direct filesystem reads via
  adapters.
- Adapters and sources require an **explicit root directory**. No ambient
  defaults, no `$HOME` fallbacks — the caller passes the path.
- Persistence lives behind the `repositories.ts` interfaces in
  `packages/storage`. Alternative backends (SQLite, hosted) ship as new
  implementation modules, not as branches inside existing ones.
- The event stream is **append-only**: no in-place mutation or compaction in
  this phase; projections are derived, not persisted.

## Consequences
- Zero-setup local development: `pnpm dev` runs against in-memory state.
- Hosted/sync is a later concern behind the same repository boundary — no
  downstream consumer should need to change when it lands.
- We accept that restarting the dev process discards all in-memory state;
  this is intentional for Phase 1.
- Requiring explicit roots means a slightly worse first-run UX, traded for
  no accidental ingestion of unrelated data.

## Alternatives considered
- **Ambient defaults (e.g., auto-detect `~/.claude`).** Rejected — too
  vendor-coupled and surprising when multiple runtimes coexist.
- **Start on SQLite.** Rejected for Phase 1 — forces schema decisions before
  the repository contract is exercised by real consumers.

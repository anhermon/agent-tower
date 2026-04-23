# 0001 — Phase 1 scope is skeleton-only

- **Status:** accepted
- **Date:** 2026-04-23
- **Deciders:** control-plane maintainers

## Context
Multiple agent harnesses (Claude Code first, others later) need a shared
observability and control surface. Building real ingestion, CRUD, and runtime
control before the domain model is stable locks in vendor-shaped concepts.

## Decision
Phase 1 ships infrastructure only:

- reusable dashboard shell (`apps/web`) with placeholder module routes,
- canonical domain types + capability-based adapter contracts
  (`packages/core`),
- in-memory event bus and storage (`packages/events`, `packages/storage`),
- one **read-only** adapter (`packages/adapter-claude-code`) that proves the
  canonical model against real data.

Explicitly deferred: real ingestion pipelines, webhook CRUD, live runtime
control (start/stop/inject), external channel credentials, persistent storage
backends, multi-user auth.

## Consequences
- Modules render empty/error states instead of fabricating data — consumers can
  rely on "if data is shown, it's real."
- The cost of adding the second adapter is bounded: contracts are already in
  place, and UI doesn't branch on vendor names.
- We accept that several pages are visually empty until a later slice lands.

## Alternatives considered
- **Build one module end-to-end first.** Rejected — bakes vendor assumptions
  into the core before the canonical model is tested against a second source.
- **Start with persistent storage.** Rejected — in-memory implementations keep
  Phase 1 runnable with zero setup and force the repository interface to be
  the contract, not the DB schema.

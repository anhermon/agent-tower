# Modular Agents Control Plane — Quick Reference

## Stack

lang=typescript, frontend=nextjs-app-router, test=vitest+playwright, package-manager=pnpm

## Skills

Load: dev-guidelines, frontend, testing. Load subagent-delegation when using subagents.

## Key Commands

- `pnpm dev` — start the dashboard.
- `pnpm typecheck` — run TypeScript checks across workspaces.
- `pnpm test` — run workspace unit tests.
- `pnpm test:e2e` — run Playwright smoke tests.

## Architecture

- `apps/web` — Next.js dashboard shell, module registry, routes, local API endpoints.
- `packages/core` — canonical domain types and adapter contracts.
- `packages/events` — typed event bus and append-only event log abstractions.
- `packages/storage` — repository interfaces and Phase 1 in-memory storage.
- `docs/architecture` — durable architecture decisions and extension guidance.

## Rules

- Keep feature modules isolated and independently testable.
- Depend on capabilities and contracts, not concrete agent names.
- Do not implement real agent ingestion until the skeleton contracts and mock flows are stable.
- Keep session notes in `.claude/session-context.md`; `.claude/` is gitignored.

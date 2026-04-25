# Modular Agents Control Plane

A local-first dashboard skeleton for managing, tracking, and analyzing multiple AI agent harnesses through a shared control-plane model.

Phase 1 intentionally focuses on infrastructure:

- reusable dashboard shell
- canonical domain types
- adapter contracts
- mock events and mock data
- local storage abstractions
- module registry and placeholder routes

Full feature modules such as Claude session analytics, webhook CRUD, agent management, Kanban observability, skills cost analysis, MCP routing, and external channel integrations should be built incrementally on top of this foundation.

## Stack

- TypeScript
- pnpm workspaces
- Next.js App Router
- Tailwind CSS
- Vitest
- Playwright

## Quick start

```bash
pnpm install   # installs deps + auto-builds workspace packages
pnpm dev       # starts dashboard at http://127.0.0.1:3000
```

**Optional — GitHub workflow engine (requires Redis):**
The webhook workflow engine starts automatically when Redis is reachable. Without it the app runs normally — workflows are silently disabled.

```bash
# macOS/Linux
brew install redis && brew services start redis
# or: docker run -d -p 6379:6379 redis:alpine

REDIS_URL=redis://localhost:6379 pnpm dev
```

## Other commands

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

## Architecture

The control plane is Claude-first for the first real adapter, but agent-agnostic at the application boundary. UI modules and services should depend on canonical domain models and capability-aware adapter contracts, not vendor-specific log formats.

See:

- [Architecture Overview](docs/architecture/overview.md)
- [Adapter Contracts](docs/architecture/adapter-contracts.md)
- [Data Model](docs/architecture/data-model.md)
- [Security Notes](docs/architecture/security.md)

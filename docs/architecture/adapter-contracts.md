# Adapter Contracts

Adapters are the only layer that understands agent-specific formats. The rest of the control plane should use canonical models from `packages/core`.

## Core Adapter Shape

An agent adapter declares identity, version, capabilities, and optional facets:

- session ingest
- replay
- runtime control
- pricing
- MCP discovery/routing
- channel delivery

## Capability Rules

- A missing capability must degrade to an unavailable state in the UI.
- Feature modules should not branch on adapter names.
- Adapter errors should be returned as typed failures and recorded in the audit event stream.

## First Real Adapter

The first real adapter should be `claude-code`. It should normalize local Claude Code data into canonical sessions and replay frames while preserving original metadata for drill-down.

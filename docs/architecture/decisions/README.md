# Architecture Decision Records

This directory captures the **why** behind load-bearing decisions. When a rule
appears in `CLAUDE.md`, `AGENTS.md`, or the broader `docs/architecture/` files,
the rationale belongs here so those files can stay short.

## Convention

- One decision per file, numbered sequentially: `NNNN-kebab-title.md`.
- Keep ADRs short (ideally under ~60 lines). Bullets over prose.
- Status is one of: `proposed`, `accepted`, `superseded`, `deprecated`.
  When superseding, link the new ADR and cross-link back.
- An ADR is **immutable once accepted** except for status changes. If the
  decision changes, write a new ADR that supersedes it — do not rewrite history.

## Template

```markdown
# NNNN — <title>

- **Status:** accepted | proposed | superseded by ADR-XXXX | deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** <names or roles>

## Context
What forced the decision? What constraints matter?

## Decision
The rule we are adopting, stated plainly.

## Consequences
What becomes easier. What becomes harder. What we accept as a tradeoff.

## Alternatives considered
One line each, with why they were rejected.
```

## Index

- [0001 — Phase 1 scope is skeleton-only](0001-phase-1-skeleton.md)
- [0002 — Agent-agnostic core + capability-based contracts](0002-agent-agnostic-core.md)
- [0003 — Local-first storage, explicit filesystem roots](0003-local-first-storage.md)

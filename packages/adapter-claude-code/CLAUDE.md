# packages/adapter-claude-code — Index

## Responsibility
- First real adapter: reads local Claude Code `*.jsonl` transcripts from an **explicitly configured root** and normalizes them to `@control-plane/core` domain types.
- Implements the `session-ingest` capability (read side) + skill-manifest discovery + skill usage/efficacy analytics shared across the web dashboard, `packages/cli`, and `packages/mcp-server`.
- No writes, no network, no ambient defaults (beyond the documented `~/.claude/projects` / `~/.claude/skills` fallback chains).
- Rationale: [ADR-0002](../../docs/architecture/decisions/0002-agent-agnostic-core.md) (adapter sits behind capability contract), [ADR-0003](../../docs/architecture/decisions/0003-local-first-storage.md) (read from local filesystem).

> `AGENTS.md` in this directory is the authoritative mapping spec (raw entry → canonical output). Read it alongside this file; do not restate its table here.

## Read First
- `AGENTS.md` — scope, public surface, canonical mapping table, extension rules.
- `src/index.ts` — public exports (session + analytics + skills).
- `src/adapter.ts` — `ClaudeCodeSessionSource` + `ClaudeCodeAnalyticsSource`.
- `src/reader.ts` — low-level JSONL enumeration + line parsing.
- `src/normalizer.ts` — pure raw→canonical mapping.
- `src/data-root.ts` — `CLAUDE_CONTROL_PLANE_DATA_ROOT` env var + `~/.claude/projects` fallback. Shared by every consumer.
- `src/analytics/*.ts` — pure folds: session-summary, cost, tools, replay, timeseries, project-summary, **waste** (`scoreSessionWaste` → 6 sub-scores + overall + verbatim flags). Every `SessionUsageSummary` carries `.waste: SessionWasteSignals` populated during `foldSessionSummary`.
- `src/skills/manifests.ts` — `SKILL.md` discovery from `CONTROL_PLANE_SKILLS_ROOTS` → `~/.claude/skills`.
- `src/skills/usage.ts` — `Skill` tool_use invocation counts + size-weighted injection totals.
- `src/skills/efficacy.ts` — session-outcome heuristic + per-skill delta vs baseline.
- `src/skills/hygiene.ts` — pure fold that classifies the catalogue into dead-weight (0 invocations), cold-giant, and negative-efficacy buckets. Powers `cp skills housekeep`.
- `src/types.ts` — raw Claude Code entry shapes, kept internal.

## Entry Points / Flow
- Session path: `ClaudeCodeSessionSource({ directory })` → `listSessions()`/`loadSession(id)` → `readTranscriptFile` → `normalizeTranscript` → canonical `SessionDescriptor` + `SessionTurn[]`.
- Analytics path: `ClaudeCodeAnalyticsSource` → `listSessionSummaries`/`loadSessionUsage`/`loadCostBreakdown`/etc. → pure folds in `analytics/`. Waste scoring is a post-hoc fold: `scoreSessionWaste(summary)` / `scoreSessionsWaste(summaries)` takes an already-folded summary (where `.waste` is populated) and returns a `WasteVerdict` — it never reads JSONL itself.
- Skills path: `listSkillsOrEmpty()` (manifests) → `computeSkillsUsage({skills})` and `computeSkillsEfficacy({skills, minSessionsForQualifying})`. Both scan the JSONL root resolved by `resolveDataRoot()` and join against the manifest catalogue.

## Local Conventions
- **Read-only.** No mutations or writes of any kind.
- **Session adapter requires explicit directory.** `ClaudeCodeSessionSource` / `ClaudeCodeAnalyticsSource` constructors never fall back to `$HOME` — callers must pass one.
- **Skills + data-root helpers resolve themselves.** `resolveDataRoot()` and `resolveSkillsRoots()` are the only exports allowed to read env vars or probe `~/.claude`. All other code receives resolved paths.
- **Graceful degradation.** Malformed lines are reported via the result's `skipped`/`errors` count, not thrown. Missing fields produce partial entities, not failures. Skill analytics swallow per-file errors and continue.
- **Preserve raw metadata.** Put adapter-specific detail under `turn.metadata` / `session.metadata` — do not leak Claude-shaped fields into canonical types.
- **Pure normalizer + folds.** `normalizer.ts` and `analytics/*.ts` must remain pure functions; all I/O stays in `reader.ts` / `skills/{usage,efficacy}.ts`.
- **Cache by `filePath:mtime`.** In-process caches in `analytics/session-summary`, `skills/usage`, `skills/efficacy` invalidate on mtime change only — callers must not hand in paths with mutated-but-not-stat'd files.

## Sharp Edges
- Sidechain / attachment normalization is deliberately out of scope until a consuming UI module needs it.
- An **ingest-target** adapter (writing batches into storage) is a separate concern — it belongs near `packages/storage`, not here.
- Additional runtimes (Codex, Hermes, etc.) must ship as sibling packages. Do not branch this adapter on runtime.
- Skill manifests live outside the data root (`~/.claude/skills` vs `~/.claude/projects`). The two roots are independent — an unconfigured skills root does NOT imply an unconfigured data root, and vice versa.
- The skill efficacy classifier currently marks ~74% of sessions as `unknown`. Treat the *sign* of `delta` as meaningful; magnitudes are noisy until the classifier recognizes more completion signals.
- Test-only cache-reset hooks (`__clearSkills*CacheForTests`) are exported from the public surface so `apps/web/lib` tests can reach them. Keep their use confined to test files.

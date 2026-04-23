---
name: control-plane-inspect
description: Use when inspecting Claude Code session, skill, and agent telemetry from inside the control-plane repo via the `cp` CLI or the @control-plane/mcp-server MCP tools. Trigger on: "audit my sessions", "analyze token usage", "waste report", "efficiency audit", "which sessions are wasteful", "context bloat", "cache thrash", "tool hammering", "which sessions used the most tokens", "top sessions by cost", "skills with negative delta", "skill efficacy", "which skills are largest", "cp sessions", "cp skills", "cp audit", "control-plane inspect", "agent inventory".
---

## When to use this skill

Map user questions to a single `cp` command. Prefer `cp` over reading JSONL transcripts or exploring `packages/adapter-claude-code` source.

**For holistic/open-ended audits (context bloat, tool hammering, cache thrash, "what's wrong with my sessions") → `cp audit` is the one-shot entry point.** It bundles top-by-cost, top-by-waste-score, corpus-wide waste aggregates, cold-giant skills, and negative-efficacy skills in one report.

| User question | Command |
| --- | --- |
| **"Audit my sessions / analyze efficiency / what's burning tokens?"** | **`cp audit --pretty`** |
| **"Which sessions are most wasteful?"** | **`cp sessions waste --limit=10 --pretty`** |
| "Which sessions used the most tokens?" | `cp sessions top --by=tokens --limit=10` |
| "Top sessions by cost this week" | `cp sessions top --by=cost --since=$(date -v-7d +%F)` |
| "Show me the full breakdown for session X" | `cp sessions show <id>` (pretty mode now prints cache hit rate + top waste flags) |
| "Which skills get invoked most often?" | `cp skills top --by=invocations` |
| "Which SKILL.md files are unusually large?" | `cp skills top --by=size --limit=20` |
| "Which skills inject the most tokens into context?" | `cp skills top --by=tokens-injected` |
| "Which skills have a negative efficacy delta?" | `cp skills efficacy --negative-only --min-sessions=5` |
| "Full skill efficacy report with sample sizes" | `cp skills efficacy` |
| **"Archive dead-weight skills / skills never invoked / clean up my skills"** | **`cp skills housekeep --pretty`** (dry-run) then **`cp skills housekeep --apply`** |
| "List every Claude Code agent (one per project cwd)" | `cp agents list` |
| "Is the control plane wired up to local data?" | `cp health` |
| "Per-project session counts" | `cp agents list --pretty` |

If the user asks a question not covered above, fall back to `cp --help` before reaching for source files.

## Setup

The CLI reads from local Claude Code data. Two env vars control discovery:

- `CLAUDE_CONTROL_PLANE_DATA_ROOT` — root of JSONL transcripts. Defaults to `~/.claude/projects`.
- `CONTROL_PLANE_SKILLS_ROOTS` — colon-separated SKILL.md roots. Defaults to `~/.claude/skills`.

> **`cp` binary shadowing.** On macOS / most Linux distros, `/bin/cp` (the system file-copy command) shadows the control-plane CLI unless it's globally linked. If `cp health` prints the `usage: cp [-R ...]` help, you hit the shadow — invoke from the repo via the node entry instead:
>
> ```sh
> node packages/cli/dist/cli.js health
> ```
>
> Rest of this doc uses `cp` for brevity; substitute the node form whenever you hit the shadow. Build once with `pnpm --filter @control-plane/cli build` before first use.

Always probe first:

```sh
cp health
```

If it returns `{"ok": false, "reason": "unconfigured"}`, the data root could not be resolved. Guide the user:

```sh
export CLAUDE_CONTROL_PLANE_DATA_ROOT="$HOME/.claude/projects"
export CONTROL_PLANE_SKILLS_ROOTS="$HOME/.claude/skills"
cp health
```

All commands emit JSON by default. Pass `--pretty` for a human-readable table when presenting to a user interactively.

## Command reference

### `cp audit`

One-shot holistic waste audit across every session in the data root. This is the right first command for any open-ended efficiency question.

Flags:
- `--limit=N` (default `20`) — how many rows per section
- `--since=YYYY-MM-DD`, `--until=YYYY-MM-DD` — date window
- `--pretty` — human-readable multi-section report (default when stdout is a tty)
- `--json` — force JSON

What it returns (both pretty and JSON):
- `dataRoot`, `sessionsScanned`, `totalEstimatedCostUsd`, `sessionsWithWasteSignals`
- **topByCost** — highest-cost sessions
- **topByWaste** — highest waste-score sessions with top flag
- **wasteAggregates** — avg overall/cacheThrash/sequentialTools/toolPollution/contextBloat, count of sessions with `bloatWithoutCompaction`, count of sessions with `overall > 0.4`
- **skillsColdGiants** — skills with `sizeBytes > 8000` AND `invocationCount < 5` (autoload candidates to drop)
- **skillsNegativeEfficacy** — skills where completion-rate delta < -0.05 with ≥5 samples
- **topProjects** — per-project session count, total cost, avg waste score

```sh
cp audit --pretty
cp audit --limit=5 --since=2026-04-16        # last week audit
cp audit --json | jq '.wasteAggregates'      # just the numbers
cp audit --json | jq '.topByWaste[] | select(.overall > 0.5)'
```

### `cp sessions waste`

Rank sessions by composite waste verdict (6 sub-scores + overall 0..1, plus verbatim flags). Use when you want a focused list rather than the full `audit` report.

Flags:
- `--limit=N` (default `10`)
- `--min-score=X` (default `0.3`) — only sessions with overall ≥ X
- `--project=<id>` — filter to one project dir id
- `--since=YYYY-MM-DD`, `--until=YYYY-MM-DD`
- `--pretty`

Verdict shape (from `@control-plane/core`'s `WasteVerdict`):
```json
{
  "sessionId": "…",
  "scores": {
    "cacheThrash": 0.0, "toolPollution": 0.0, "sequentialTools": 0.0,
    "toolHammering": 0.0, "contextBloat": 0.0, "compactionAbsence": 0.0
  },
  "overall": 0.0,
  "flags": ["Cache thrash: 50.1% (ratio 0.501)", "Single-tool turns: 67.3% (221 / 328)"]
}
```

Flag strings are verbatim — they quote the actual ratio, path, or tool name. Quote them back to the user unchanged.

Typical flag categories (emitted when the sub-score > 0.3):
- `Cache thrash: X% (ratio Y)` — prefix thrashing, cacheCreation dominates cacheRead
- `Single-tool turns: X% (N / M)` — missed batching, one tool per turn
- `Repeat reads: Read(<path>) ×N` — same file Read ≥3×
- `Tool failure rate: X%` — tool_use blocks erroring
- `Long session without /compact: Xk peak input` — bloatWithoutCompaction
- `Context bloat: Xk peak input between compactions`
- `Tool pollution: N distinct tools, X% MCP` — too many tools, MCP-weighted

### Known calibration limits (read before quoting a waste score)

The current scorer (`packages/adapter-claude-code/src/analytics/waste.ts` + `session-summary.ts`) has no session-size gating on several sub-scores. Don't treat a high `overall` in isolation — cross-check with session length and cost first.

1. **`sequentialToolTurnPct` saturates 0.5→0.85 with zero turn-count gate.** A 1-turn session that used exactly one tool scores **the same `sequentialTools = 1.0`** as a 309-turn session that never batched. In the current corpus the corpus-wide average for this sub-score is ≈ 0.73 — it's loud enough to dominate the `overall` score on almost every session. Before quoting "Single-tool turns: 100%" as waste, verify `turns >= 10` and that the session isn't a structurally single-tool flow (pure chat, single-task automation, aborted session).
2. **`toolFailurePct` has no minimum-sample gate.** A session with 1 tool call that failed → `toolFailurePct = 1.0` → `toolHammering = 1.0`. Always check `totalToolResults` before quoting a failure rate; anything under ~5 calls is noise.
3. **`bloatWithoutCompaction` is a binary signal with no duration gate.** A 6-turn / 30-second session that happens to hit 150k peak input is flagged identically to a 3-hour 500-turn session. Cross-reference with `durationMs` before acting.
4. **Top-waste lists ≠ top-cost lists.** The most *expensive* sessions often aren't in the top-waste ranking (they have healthy cache-reuse and big genuine context), while the top-waste ranking is frequently dominated by short artifact sessions. For "what to actually fix" recommendations, start from `cp sessions top --by=cost` then filter by waste, not the other way around.

If the user is asking "what should I actually change?", use the **"Trustworthy waste triage" recipe** below (which applies these guards) rather than raw `cp sessions waste` output.

### `cp health`

Probe data root + inventory counts.

```sh
cp health
```

Example output:

```json
{
  "ok": true,
  "dataRoot": "/Users/me/.claude/projects",
  "skillsRoots": ["/Users/me/.claude/skills"],
  "inventory": { "projects": 42, "sessions": 318, "skills": 27 }
}
```

### `cp sessions top`

Rank sessions by tokens, cost, or turns.

Flags:
- `--by=tokens|cost|turns` (default `tokens`)
- `--limit=N` (default `10`)
- `--project=<id>` — filter to one project dir id
- `--since=YYYY-MM-DD`, `--until=YYYY-MM-DD` — date window

```sh
cp sessions top --by=cost --limit=5 --since=2026-04-16
```

Example output:

```json
{
  "ok": true,
  "by": "cost",
  "results": [
    {
      "sessionId": "a1b2c3",
      "project": "-Users-me-workspace-control-plane",
      "startedAt": "2026-04-22T14:03:11Z",
      "turns": 87,
      "tokens": { "input": 1240000, "output": 42000, "cacheCreation": 310000, "cacheRead": 9800000 },
      "costUsd": 7.81
    }
  ]
}
```

### `cp sessions show <id>`

Full summary for one session (turn-level token usage, tool calls, skills injected).

```sh
cp sessions show a1b2c3
```

Example output:

```json
{
  "ok": true,
  "session": {
    "id": "a1b2c3",
    "project": "-Users-me-workspace-control-plane",
    "startedAt": "2026-04-22T14:03:11Z",
    "endedAt": "2026-04-22T15:47:02Z",
    "turns": 87,
    "tokens": { "input": 1240000, "output": 42000, "cacheCreation": 310000, "cacheRead": 9800000 },
    "costUsd": 7.81,
    "skillsInjected": ["dev-guidelines", "testing", "nextjs-dev-setup"],
    "outcome": "completed"
  }
}
```

### `cp skills top`

Rank skills.

Flags:
- `--by=invocations|size|bytes-injected|tokens-injected` (default `invocations`)
- `--limit=N` (default `10`)

```sh
cp skills top --by=size --limit=5
```

Example output:

```json
{
  "ok": true,
  "by": "size",
  "results": [
    { "name": "dealhub", "path": "/Users/me/.claude/skills/dealhub/SKILL.md", "sizeBytes": 48210, "invocations": 14 },
    { "name": "cc-lens",  "path": "/Users/me/.claude/skills/cc-lens/SKILL.md",  "sizeBytes": 31044, "invocations": 9 }
  ]
}
```

### `cp skills usage`

Full usage report across all discovered skills.

```sh
cp skills usage --limit=50
```

Example output:

```json
{
  "ok": true,
  "results": [
    {
      "name": "testing",
      "invocations": 42,
      "sessions": 18,
      "bytesInjected": 186420,
      "tokensInjected": 46605
    }
  ]
}
```

### `cp skills efficacy`

Outcome heuristic per skill (`completed` / `partial` / `abandoned` / `unknown`) plus delta vs. the all-sessions baseline completion rate.

Flags:
- `--negative-only` — only skills with negative delta
- `--min-sessions=N` — drop skills with too few samples (default `3`)
- `--limit=N`

```sh
cp skills efficacy --negative-only --min-sessions=5
```

Example output:

```json
{
  "ok": true,
  "baselineCompletionRate": 0.62,
  "results": [
    {
      "name": "dealhub",
      "sessions": 12,
      "completionRate": 0.41,
      "delta": -0.21,
      "outcomes": { "completed": 5, "partial": 4, "abandoned": 2, "unknown": 1 }
    }
  ]
}
```

### `cp agents list`

One row per Claude Code project directory (each is an "agent" in the control-plane model).

```sh
cp agents list
```

Example output:

```json
{
  "ok": true,
  "agents": [
    { "id": "-Users-me-workspace-control-plane", "cwd": "/Users/me/workspace/control-plane", "sessions": 87, "lastActive": "2026-04-22T15:47:02Z" },
    { "id": "-Users-me-workspace-dh-api",        "cwd": "/Users/me/workspace/dh-api",        "sessions": 31, "lastActive": "2026-04-20T19:12:44Z" }
  ]
}
```

## MCP equivalents

`@control-plane/mcp-server` is registered via `.mcp.json` at the repo root, so MCP-aware clients pick it up automatically. Same capabilities, typed inputs.

| `cp` command | MCP tool |
| --- | --- |
| `cp health` | `control_plane_health` |
| `cp audit` | `control_plane_audit` |
| `cp sessions top` | `sessions_top` |
| `cp sessions show` | `sessions_show` |
| `cp sessions waste` | `sessions_waste` |
| `cp skills top` | `skills_top` |
| `cp skills usage` | `skills_usage` |
| `cp skills efficacy` | `skills_efficacy` |
| `cp skills housekeep` | `skills_housekeep` (read-only dry-run; apply is CLI-only) |
| `cp agents list` | `agents_list` |

## CLI vs MCP

Use the CLI for shell pipelines (`cp sessions top --json | jq ...`), ad-hoc one-liners, and CI scripts — anything that benefits from `jq`, redirection, or exit codes. Use the MCP tools when invoking from an LLM agent that wants typed arguments and a structured response without shell escaping. Both read the same local data and return equivalent shapes, so pick whichever fits the caller.

## Common recipes

### Full efficiency audit (start here)

```sh
cp audit --pretty
```

Use this whenever the user asks an open-ended "what's wrong with my sessions" question. The pretty report has five sections: top-by-cost, top-by-waste, corpus aggregates, cold-giant skills, negative-efficacy skills, and per-project breakdown. Quote verbatim flags back to the user — they already contain the evidence.

### Drill into the worst offenders after audit

```sh
cp audit --json | jq -r '.topByWaste[0].sessionId' | xargs -I{} cp sessions show {} --pretty
```

### This week's high-waste sessions only

```sh
cp sessions waste --min-score=0.4 --since=$(date -v-7d +%F) --pretty
```

### Yesterday's top cache-creation burners

```sh
cp sessions top --by=tokens --since=$(date -v-1d +%F) --until=$(date +%F) --limit=10 \
  | jq '.results | sort_by(-.tokens.cacheCreation) | .[] | {sessionId, cacheCreation: .tokens.cacheCreation, costUsd}'
```

### Skills with a negative efficacy delta and meaningful sample size

```sh
cp skills efficacy --negative-only --min-sessions=5 \
  | jq '.results[] | {name, sessions, delta, completionRate}'
```

### Deep-dive one session's turn-level usage

```sh
SID=$(cp sessions top --by=tokens --limit=1 | jq -r '.results[0].sessionId')
cp sessions show "$SID" --pretty
```

### Per-project session counts

```sh
cp agents list | jq '.agents | sort_by(-.sessions) | .[] | {cwd, sessions}'
```

### Cost concentration (where to aim the fix)

In most corpora, cost is extremely skewed: a handful of long-running sessions consume ~30–50% of total spend. Always compute concentration before recommending blanket changes — the fix goes where the dollars are.

```sh
cp audit --json \
  | jq '{total: .totalEstimatedCostUsd,
         top20: ([.topByCost[0:20][].costUsd] | add),
         top50_share: (([.topByCost[0:50][].costUsd] | add) / .totalEstimatedCostUsd)}'
```

Then rank the top-cost sessions **by `cacheCreation / (cacheCreation + cacheRead)`** — the ones with the worst reuse are the real money leaks, not the ones with the highest raw cost:

```sh
cp sessions top --by=cost --limit=20 --json \
  | jq '.results[] | {id: .sessionId, cost: .costUsd, turns,
         reuse: (.tokens.cacheRead / (.tokens.cacheCreation + 1))}' \
  | jq -s 'sort_by(.reuse) | .[0:10]'
```

### Trustworthy waste triage (guards against scoring artifacts)

`cp sessions waste` alone is noisy because `sequentialTools` saturates on tiny sessions (see "Known calibration limits"). Intersect it with cost and turn-count thresholds to get an actionable list:

```sh
cp sessions waste --min-score=0.4 --limit=50 --json \
  | jq '.results[] | select(.turns >= 20 and .costUsd >= 1.0)' \
  | jq -s 'sort_by(-.overall) | .[0:10]'
```

Rule of thumb: a session is *actionable waste* only if at least one of these holds:
- `costUsd >= 5` AND any sub-score >= 0.4 (expensive + suspicious)
- `cacheCreation > cacheRead` (literal cache thrash, not just high percentage)
- `peakInputTokensBetweenCompactions > 200_000` AND `compactions == 0` (real bloat)
- Same file read ≥ 5 times (real hammering)

Dismiss as noise: sessions under 10 turns OR under $1 cost, unless the user is specifically debugging short-session behavior.

### Skill hygiene audit (ROI-ranked)

Combine `skills top` slices to rank by actual *injected token cost* (what the user pays every session the skill appears in):

```sh
cp skills top --by=tokens-injected --limit=20 --json \
  | jq '.results[] | {name, invocations, sizeBytes, tokensInjected,
         costUsd: (.tokensInjected / 1000000 * 3)}'
```

Then find the "cold giants" — large SKILL.md files that autoload (or auto-match) frequently but are rarely invoked as first-class skills. These are dead weight in the system prompt:

```sh
cp skills top --by=size --limit=20 --json \
  | jq '.results[] | select(.sizeBytes > 8000 and .invocations < 5)'
```

And find skills that appear *injected* on disk but never in transcripts — pure dead weight:

```sh
comm -23 \
  <(ls ~/.claude/skills | sort) \
  <(cp skills usage --json | jq -r '.results[].name' | sort)
```

### Archive dead-weight skills

`cp skills housekeep` audits every `SKILL.md` under `CONTROL_PLANE_SKILLS_ROOTS` (default `~/.claude/skills`) and classifies it into three buckets:

- **Dead weight** — 0 invocations across scanned sessions. Safe to archive automatically.
- **Cold giants** — `sizeBytes > 8000` AND 1–4 invocations. Pure context tax when auto-loaded; report only, no automatic archival.
- **Negative efficacy** — Δ < -0.05 over ≥5 qualifying sessions. Report only.

Dry run first (default):

```sh
cp skills housekeep --pretty
```

Once you've reviewed the dead-weight list, move the directories into `<skillsRoot>/.archive/<YYYYMMDD-HHMMSS>/` with:

```sh
cp skills housekeep --apply
```

`--apply` NEVER deletes. It only renames each dead-weight directory under `.archive/<timestamp>/`, preserving the root-relative layout. To revert, move the directory back out of `.archive/`. The MCP equivalent (`skills_housekeep`) is read-only by design — use the CLI for the destructive half.

### Top-cost deep-dive template

When the user asks "why is session X expensive?", run:

```sh
SID=<session-id>
cp sessions show "$SID" --pretty
```

Then classify by cache-reuse ratio (the single most useful metric):
- `cacheRead / cacheCreation` **> 16** → healthy reuse; session is expensive because it was *long*, not wasteful. Recommend model downgrade (Opus → Sonnet) for sessions with >600 turns where Sonnet would do.
- `cacheRead / cacheCreation` **6–16** → average; look for compaction absence and context bloat.
- `cacheRead / cacheCreation` **< 6** → real cache thrash; look for schema re-injection, mid-session MCP server changes, or rapid branching.

## Constraints

- Read-only. No command writes to the JSONL transcripts, the skill files, or any remote service.
- Data is local. Nothing is fetched over the network; everything resolves under `CLAUDE_CONTROL_PLANE_DATA_ROOT` and `CONTROL_PLANE_SKILLS_ROOTS`.
- Empty / unresolved state returns `{"ok": false, "reason": "unconfigured"}`. Do not fabricate data or fall back to mocks — surface the reason and guide the user to set the env vars.
- Commands never synthesize sessions, skills, or metrics that are not present on disk. If the inventory is empty, `results` is `[]`.
- `--json` is the default; pass `--pretty` only when presenting to a human.

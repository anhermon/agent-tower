---
name: control-plane-inspect
description: Use when inspecting Claude Code session, skill, and agent telemetry from inside the control-plane repo via the `cp` CLI or the @control-plane/mcp-server MCP tools. Trigger on: "which sessions used the most tokens", "top sessions by cost", "high token sessions", "skills with negative delta", "skill efficacy", "which skills are largest", "skill invocation counts", "cp sessions", "cp skills", "control-plane inspect", "agent inventory".
---

## When to use this skill

Map user questions to a single `cp` command. Prefer `cp` over reading JSONL transcripts or exploring `packages/adapter-claude-code` source.

| User question | Command |
| --- | --- |
| "Which sessions used the most tokens?" | `cp sessions top --by=tokens --limit=10` |
| "Top sessions by cost this week" | `cp sessions top --by=cost --since=$(date -v-7d +%F)` |
| "Show me the full breakdown for session X" | `cp sessions show <id>` |
| "Which skills get invoked most often?" | `cp skills top --by=invocations` |
| "Which SKILL.md files are unusually large?" | `cp skills top --by=size --limit=20` |
| "Which skills inject the most tokens into context?" | `cp skills top --by=tokens-injected` |
| "Which skills have a negative efficacy delta?" | `cp skills efficacy --negative-only --min-sessions=5` |
| "Full skill efficacy report with sample sizes" | `cp skills efficacy` |
| "List every Claude Code agent (one per project cwd)" | `cp agents list` |
| "Is the control plane wired up to local data?" | `cp health` |
| "Per-project session counts" | `cp agents list --pretty` |

If the user asks a question not covered above, fall back to `cp --help` before reaching for source files.

## Setup

The CLI reads from local Claude Code data. Two env vars control discovery:

- `CLAUDE_CONTROL_PLANE_DATA_ROOT` — root of JSONL transcripts. Defaults to `~/.claude/projects`.
- `CONTROL_PLANE_SKILLS_ROOTS` — colon-separated SKILL.md roots. Defaults to `~/.claude/skills`.

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
| `cp sessions top` | `sessions_top` |
| `cp sessions show` | `sessions_show` |
| `cp skills top` | `skills_top` |
| `cp skills usage` | `skills_usage` |
| `cp skills efficacy` | `skills_efficacy` |
| `cp agents list` | `agents_list` |

## CLI vs MCP

Use the CLI for shell pipelines (`cp sessions top --json | jq ...`), ad-hoc one-liners, and CI scripts — anything that benefits from `jq`, redirection, or exit codes. Use the MCP tools when invoking from an LLM agent that wants typed arguments and a structured response without shell escaping. Both read the same local data and return equivalent shapes, so pick whichever fits the caller.

## Common recipes

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

## Constraints

- Read-only. No command writes to the JSONL transcripts, the skill files, or any remote service.
- Data is local. Nothing is fetched over the network; everything resolves under `CLAUDE_CONTROL_PLANE_DATA_ROOT` and `CONTROL_PLANE_SKILLS_ROOTS`.
- Empty / unresolved state returns `{"ok": false, "reason": "unconfigured"}`. Do not fabricate data or fall back to mocks — surface the reason and guide the user to set the env vars.
- Commands never synthesize sessions, skills, or metrics that are not present on disk. If the inventory is empty, `results` is `[]`.
- `--json` is the default; pass `--pretty` only when presenting to a human.

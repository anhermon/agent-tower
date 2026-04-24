# packages/cli — Index

## Responsibility
- Read-only CLI (`cp` binary) that exposes the same analytics surface as the web dashboard and MCP server — same canonical core types, same adapter calls, no duplication of logic.
- Non-interactive, script-friendly: JSON by default, `--pretty` for human output.
- **Does not** write state, mutate sessions, or call any network.

## Read First
- `src/cli.ts` — argv parsing + subcommand dispatcher.
- `src/index.ts` — public exports (keep narrow).
- `src/commands/*.ts` — one file per subcommand (see table below).
- `src/output.ts` + `src/flags.ts` — JSON/pretty rendering + flag parser.
- `src/data-root.ts` — resolves `CLAUDE_CONTROL_PLANE_DATA_ROOT` → `~/.claude/projects` fallback.

## Subcommands
`cp health | audit | sessions top|show|waste | skills top|usage|efficacy|housekeep | agents list | mcp <stub>`. One `*.ts` + `*.test.ts` pair per command under `src/commands/`. Every command returns a plain object — `output.ts` handles stringification.

**`cp skills housekeep`** is the only subcommand that writes to disk. By default it's a dry run that lists dead-weight / cold-giant / negative-efficacy skills. With `--apply`, it moves dead-weight skill directories to `<skillsRoot>/.archive/<YYYYMMDD-HHMMSS>/`. It never deletes, and never touches cold-giant or negative-efficacy entries.

**`cp sessions show <id> [--timeline]`** loads a single session summary. `--timeline` attaches per-turn tool/token rollup (`TurnTimeline`) and skill-to-turn attribution (`SkillTurnAttribution`). Without the flag those fields are omitted.

**`cp audit`** is the holistic one-shot audit. Bundles top-by-cost, top-by-waste-score, corpus-wide waste aggregates, cold-giant skills, negative-efficacy skills, and per-project breakdown. The rest of the subcommands are single-question tools — prefer `audit` for open-ended efficiency questions, the others for targeted follow-ups.

**`cp sessions waste`** emits a `WasteVerdict` per session (6 sub-scores + overall 0..1 + verbatim flags). Scoring lives in `@control-plane/adapter-claude-code`'s `analytics/waste.ts`; per-session `SessionWasteSignals` are folded during `foldSessionSummary`.

## Entry Points / Flow
argv → `cli.ts` parses flags → dispatches to `commands/<name>.ts` → command imports from `@control-plane/adapter-claude-code` (same functions the web app uses) → returns `{ ok, value | reason }` → `output.ts` formats.

## Dependencies
- Consumes: `@control-plane/core`, `@control-plane/adapter-claude-code`.
- Published binary: `cp` → `dist/cli.js` (tsc output, chmod +x via `postbuild`).

## Local Conventions
- **Never import from `apps/web/*`.** CLI and web share the adapter, not the web app.
- **One command = one file + one test.** Follow the pattern in `commands/sessions-top.ts`.
- **Exit codes:** `0` success, `1` operational failure (e.g. unconfigured data root), `2` usage error (bad flags). Command functions return results; the exit code is decided in `cli.ts`.
- **Flags are explicit.** Use `flags.ts` parsers — no ad-hoc `process.argv` slicing inside commands.

## Sharp Edges
- `pnpm --filter @control-plane/cli build` must run before `cp` works — `dist/` is not committed.
- The shared analytics cache in `@control-plane/adapter-claude-code` is per-process, so each `cp` invocation cold-starts the scan. For tight loops, prefer the MCP server (`packages/mcp-server`) which retains cache across tool calls.

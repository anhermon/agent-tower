import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Shared Claude Code JSONL fixtures. Intentionally tiny — each covers one
// distinct scenario the analytics folds must handle:
//   - single-turn:     baseline user + assistant with usage
//   - multi-turn:      Read tool call + follow-ups with cache reads
//   - compaction:      `compact_boundary` system event between turns
//   - thinking:        assistant turn with an extended-thinking block
//   - mcp-tool:        `mcp__<server>__<tool>` call
//   - task-agent:      `Task` sub-agent invocation + sidechain response
//   - web-search:      WebSearch + WebFetch in the same assistant turn

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export type ClaudeCodeFixtureName =
  | "single-turn"
  | "multi-turn"
  | "compaction"
  | "thinking"
  | "mcp-tool"
  | "task-agent"
  | "web-search";

export const CLAUDE_CODE_FIXTURE_NAMES = [
  "single-turn",
  "multi-turn",
  "compaction",
  "thinking",
  "mcp-tool",
  "task-agent",
  "web-search"
] as const satisfies readonly ClaudeCodeFixtureName[];

export interface ClaudeCodeFixture {
  readonly name: ClaudeCodeFixtureName;
  readonly sessionId: string;
  readonly path: string;
  readonly contents: string;
  readonly entries: readonly Record<string, unknown>[];
}

function load(name: ClaudeCodeFixtureName): ClaudeCodeFixture {
  const p = path.join(__dirname, `${name}.jsonl`);
  const contents = readFileSync(p, "utf8");
  const entries = contents
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const first = entries[0];
  const sessionId =
    typeof first?.["sessionId"] === "string" ? (first["sessionId"] as string) : name;
  return { name, sessionId, path: p, contents, entries };
}

export function claudeCodeFixture(name: ClaudeCodeFixtureName): ClaudeCodeFixture {
  return load(name);
}

export function allClaudeCodeFixtures(): readonly ClaudeCodeFixture[] {
  return CLAUDE_CODE_FIXTURE_NAMES.map(load);
}

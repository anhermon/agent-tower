import { ClaudeCodeAnalyticsSource } from "@control-plane/adapter-claude-code";
import type { SessionUsageSummary } from "@control-plane/core";
import { resolveOrExplain } from "../data-root.js";
import { parseFlags, UsageError } from "../flags.js";
import { bold, resolveOutputMode, writeJson, writeLine } from "../output.js";

export async function runSessionsShow(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    full?: boolean;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    full: { type: "boolean" },
  });

  const sessionId = positionals[0];
  if (!sessionId) {
    throw new UsageError("cp sessions show <id> — session id is required");
  }

  const mode = resolveOutputMode(values);
  const resolved = resolveOrExplain(mode);
  if (!resolved) return 0;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const summary = await source.loadSessionUsage(sessionId);

  if (!summary) {
    if (mode.json) {
      writeJson({ ok: false, reason: "not-found", sessionId });
      return 1;
    }
    writeLine(`Session not found: ${sessionId}`);
    return 1;
  }

  if (mode.json) {
    writeJson({ ok: true, session: projectSummary(summary, values.full === true) });
    return 0;
  }

  writeLine(bold(`Session ${summary.sessionId}`));
  writeLine("");
  writeLine(`Model:            ${summary.model ?? "-"}`);
  writeLine(`Started:          ${summary.startTime ?? "-"}`);
  writeLine(`Ended:            ${summary.endTime ?? "-"}`);
  writeLine(`User messages:    ${summary.userMessageCount}`);
  writeLine(`Assistant msgs:   ${summary.assistantMessageCount}`);
  writeLine(`Input tokens:     ${summary.usage.inputTokens}`);
  writeLine(`Output tokens:    ${summary.usage.outputTokens}`);
  writeLine(`Cache read:       ${summary.usage.cacheReadInputTokens}`);
  writeLine(`Cache creation:   ${summary.usage.cacheCreationInputTokens}`);
  writeLine(`Estimated cost:   $${summary.estimatedCostUsd.toFixed(4)}`);
  writeLine(`Cwd:              ${summary.cwd ?? "-"}`);
  return 0;
}

function projectSummary(summary: SessionUsageSummary, includeTurns: boolean): unknown {
  if (includeTurns) return summary;
  const { turns: _turns, ...rest } = summary;
  return rest;
}

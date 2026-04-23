import { ClaudeCodeAnalyticsSource, scoreSessionWaste } from "@control-plane/adapter-claude-code";
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
  if (!resolved) return 1;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const summary = await source.loadSessionUsage(sessionId);

  if (!summary) {
    if (mode.json) {
      writeJson({ ok: false, reason: "not_found", sessionId });
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
  writeLine(`Cache hit rate:   ${(summary.cacheEfficiency.hitRate * 100).toFixed(1)}%`);
  writeLine(`Estimated cost:   $${summary.estimatedCostUsd.toFixed(4)}`);
  writeLine(`Cwd:              ${summary.cwd ?? "-"}`);

  // Waste signals were added in Phase 1 of the waste-analytics rollout and are
  // populated on every summary emitted by the current analytics fold. When the
  // adapter decides to omit them (older fixture, partial fold), skip quietly.
  if (summary.waste) {
    const verdict = scoreSessionWaste(summary);
    const topFlags = verdict.flags.slice(0, 3);
    writeLine("");
    writeLine(`Waste score:      ${verdict.overall.toFixed(3)} (overall, 0..1)`);
    if (topFlags.length === 0) {
      writeLine("No waste flags above threshold.");
    } else {
      writeLine(bold("Top waste flags:"));
      for (const flag of topFlags) {
        writeLine(`  - ${flag}`);
      }
    }
  }
  return 0;
}

function projectSummary(summary: SessionUsageSummary, includeTurns: boolean): unknown {
  if (includeTurns) return summary;
  const { turns: _turns, ...rest } = summary;
  return rest;
}

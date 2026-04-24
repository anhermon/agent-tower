import {
  ClaudeCodeAnalyticsSource,
  type SkillTurnAttribution,
  scoreSessionWaste,
  type TurnTimeline,
} from "@control-plane/adapter-claude-code";
import type { SessionUsageSummary } from "@control-plane/core";

import { resolveOrExplain } from "../data-root.js";
import { parseFlags, UsageError } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

export async function runSessionsShow(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    full?: boolean;
    timeline?: boolean;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    full: { type: "boolean" },
    timeline: { type: "boolean" },
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

  const includeTimeline = values.timeline === true;
  const timelineBundle = includeTimeline ? await source.loadSessionTimeline(sessionId) : undefined;

  if (mode.json) {
    writeJson({
      ok: true,
      session: projectSummary(summary, values.full === true, timelineBundle),
    });
    return 0;
  }

  printSessionPretty(summary);

  if (timelineBundle) {
    writeLine("");
    writeLine(bold("Per-turn timeline (assistant turns only)"));
    writeLine(renderTimelineTable(timelineBundle.timeline, timelineBundle.skillAttribution));
  }

  return 0;
}

function printSessionPretty(summary: SessionUsageSummary): void {
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
  printWasteSection(summary);
}

function printWasteSection(summary: SessionUsageSummary): void {
  // Waste signals were added in Phase 1 of the waste-analytics rollout and are
  // populated on every summary emitted by the current analytics fold. When the
  // adapter decides to omit them (older fixture, partial fold), skip quietly.
  if (!summary.waste) return;
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

function projectSummary(
  summary: SessionUsageSummary,
  includeTurns: boolean,
  timelineBundle:
    | { readonly timeline: TurnTimeline; readonly skillAttribution: SkillTurnAttribution }
    | undefined
): unknown {
  const base = includeTurns ? summary : stripTurns(summary);
  if (!timelineBundle) return base;
  return {
    ...(base as object),
    timeline: timelineBundle.timeline,
    skillAttribution: timelineBundle.skillAttribution,
  };
}

function stripTurns(summary: SessionUsageSummary): Omit<SessionUsageSummary, "turns"> {
  const { turns: _turns, ...rest } = summary;
  void _turns;
  return rest;
}

function renderTimelineTable(timeline: TurnTimeline, attribution: SkillTurnAttribution): string {
  const attrByTurn = new Map(attribution.entries.map((e) => [e.turnIndex, e]));
  const headers = ["#", "tools", "cacheHit%", "inTok", "outTok", "skills", "flags"];
  const rows: string[][] = [];
  for (const entry of timeline.entries) {
    if (entry.role !== "assistant") continue;
    const skills = attrByTurn.get(entry.turnIndex)?.skillsActivatedOnThisTurn ?? [];
    const flags: string[] = [];
    if (entry.wastedTurn) flags.push("WASTE");
    rows.push([
      String(entry.turnIndex),
      summarizeTools(entry.toolsUsed),
      `${(entry.cacheHitRate * 100).toFixed(1)}`,
      String(entry.inputTokens),
      String(entry.outputTokens),
      skills.join(",") || "-",
      flags.join(",") || "-",
    ]);
  }
  if (rows.length === 0) return "(no assistant turns)";
  return renderTable(headers, rows);
}

function summarizeTools(tools: readonly string[]): string {
  if (tools.length === 0) return "-";
  if (tools.length <= 3) return tools.join(",");
  return `${tools.slice(0, 3).join(",")}+${tools.length - 3}`;
}

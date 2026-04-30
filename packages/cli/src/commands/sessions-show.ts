import {
  ClaudeCodeAnalyticsSource,
  computeBootstrapBreakdown,
  computeSkillTurnAttribution,
  computeToolCostView,
  computeTurnTimeline,
  listSessionFiles,
  readTranscriptFile,
  scoreSessionWaste,
  type BootstrapBreakdown,
  type SkillTurnAttribution,
  type ToolCostView,
  type TurnTimeline,
} from "@control-plane/adapter-claude-code";
import type { SessionUsageSummary } from "@control-plane/core";

import { resolveOrExplain } from "../data-root.js";
import { parseFlags, UsageError } from "../flags.js";
import { bold, dim, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

export async function runSessionsShow(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    full?: boolean;
    timeline?: boolean;
    bootstrap?: boolean;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    full: { type: "boolean" },
    timeline: { type: "boolean" },
    bootstrap: { type: "boolean" },
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

  let timeline: TurnTimeline | undefined;
  let skillAttribution: SkillTurnAttribution | undefined;
  let toolCostView: ToolCostView | undefined;
  let bootstrapBreakdown: BootstrapBreakdown | undefined;

  if (values.timeline || values.bootstrap) {
    const files = await listSessionFiles({ directory: resolved.directory });
    const file = files.find((f) => f.sessionId === sessionId);
    if (file) {
      const { entries } = await readTranscriptFile(file.filePath);
      if (values.timeline) {
        timeline = computeTurnTimeline(entries, { sessionId });
        skillAttribution = computeSkillTurnAttribution(entries, { sessionId });
        toolCostView = computeToolCostView(entries, { sessionId });
      }
      if (values.bootstrap) {
        bootstrapBreakdown = computeBootstrapBreakdown(entries, { sessionId });
      }
    }
  }

  if (mode.json) {
    const base = projectSummary(summary, values.full === true) as Record<string, unknown>;
    writeJson({
      ok: true,
      session: {
        ...base,
        ...(timeline ? { timeline } : {}),
        ...(skillAttribution ? { skillAttribution } : {}),
        ...(toolCostView ? { toolCostView } : {}),
        ...(bootstrapBreakdown ? { bootstrapBreakdown } : {}),
      },
    });
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

  // ── Bootstrap context breakdown ──────────────────────────────────────────
  if (bootstrapBreakdown) {
    writeLine("");
    writeLine(bold("Bootstrap context breakdown"));
    writeLine(
      `System prompt: ${bootstrapBreakdown.systemPromptBytes.toLocaleString()} bytes  (~${bootstrapBreakdown.estimatedSystemPromptTokens.toLocaleString()} tokens)`
    );
    if (bootstrapBreakdown.components.length === 0) {
      writeLine(dim("  (no components detected)"));
    } else {
      writeLine("");
      const rows = bootstrapBreakdown.components.map((c) => [
        kindLabel(c.kind),
        c.name.length > 60 ? `\u2026${c.name.slice(-59)}` : c.name,
        c.sizeBytes.toLocaleString(),
        `~${c.estimatedTokens.toLocaleString()}`,
      ]);
      writeLine(renderTable(["Kind", "Name", "Bytes", "Est. tokens"], rows));
    }
  }

  // ── Tool token attribution ───────────────────────────────────────────────
  if (toolCostView && toolCostView.tools.length > 0) {
    writeLine("");
    writeLine(bold("Tool token attribution"));
    writeLine(
      `Total calls: ${toolCostView.totalToolCalls}  attributed output tokens: ${toolCostView.totalAttributedOutputTokens.toLocaleString()}`
    );
    writeLine("");
    const rows = toolCostView.tools
      .slice(0, 15)
      .map((t) => [
        t.toolName,
        String(t.callCount),
        t.outputTokensFromTurns.toLocaleString(),
        t.inputTokensFromTurns.toLocaleString(),
        t.cacheReadTokensFromTurns.toLocaleString(),
      ]);
    writeLine(
      renderTable(["Tool", "Calls", "Output tokens", "Input tokens", "Cache-read tokens"], rows)
    );
  }

  // ── Per-turn token ledger ────────────────────────────────────────────────
  if (timeline && timeline.entries.length > 0) {
    writeLine("");
    writeLine(bold("Per-turn token ledger"));
    const rows = timeline.entries.map((e) => [
      String(e.turnIndex),
      e.role,
      e.timestamp ? e.timestamp.slice(11, 19) : "-",
      e.inputTokens > 0 ? e.inputTokens.toLocaleString() : "-",
      e.outputTokens > 0 ? e.outputTokens.toLocaleString() : "-",
      e.cacheReadTokens > 0 ? e.cacheReadTokens.toLocaleString() : "-",
      e.cacheCreationTokens > 0 ? e.cacheCreationTokens.toLocaleString() : "-",
      e.toolsUsed.length > 0 ? e.toolsUsed.slice(0, 3).join(",") : "-",
      e.wastedTurn ? "!" : "",
    ]);
    writeLine(
      renderTable(["#", "Role", "Time", "Input", "Output", "Cread", "Ccreate", "Tools", "W"], rows)
    );
  }

  // ── Skills active in session ─────────────────────────────────────────────
  if (skillAttribution && skillAttribution.entries.length > 0) {
    const allSkills = new Set<string>();
    for (const e of skillAttribution.entries) {
      for (const s of e.skillsActiveCumulative) allSkills.add(s);
    }
    if (allSkills.size > 0) {
      writeLine("");
      writeLine(bold("Skills active in session"));
      const skillList = Array.from(allSkills).sort();
      for (const skill of skillList) {
        const firstTurn = skillAttribution.entries.find((e) =>
          e.skillsActivatedOnThisTurn.includes(skill)
        );
        writeLine(
          `  ${skill}${firstTurn !== undefined ? dim(` (turn ${firstTurn.turnIndex})`) : ""}`
        );
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

function kindLabel(kind: string): string {
  switch (kind) {
    case "claude_md":
      return "CLAUDE.md";
    case "agents_md":
      return "AGENTS.md";
    case "skill":
      return "Skill";
    case "system_preamble":
      return "Preamble";
    case "other_md":
      return "Other .md";
    default:
      return kind;
  }
}

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

interface TranscriptData {
  timeline?: TurnTimeline;
  skillAttribution?: SkillTurnAttribution;
  toolCostView?: ToolCostView;
  bootstrapBreakdown?: BootstrapBreakdown;
}

async function loadTranscriptData(
  directory: string,
  sessionId: string,
  flags: { timeline?: boolean; bootstrap?: boolean }
): Promise<TranscriptData> {
  const files = await listSessionFiles({ directory });
  const file = files.find((f) => f.sessionId === sessionId);
  if (!file) return {};
  const { entries } = await readTranscriptFile(file.filePath);
  const data: TranscriptData = {};
  if (flags.timeline) {
    data.timeline = computeTurnTimeline(entries, { sessionId });
    data.skillAttribution = computeSkillTurnAttribution(entries, { sessionId });
    data.toolCostView = computeToolCostView(entries, { sessionId });
  }
  if (flags.bootstrap) {
    data.bootstrapBreakdown = computeBootstrapBreakdown(entries, { sessionId });
  }
  return data;
}

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

  const needsTranscript = values.timeline === true || values.bootstrap === true;
  const data: TranscriptData = needsTranscript
    ? await loadTranscriptData(resolved.directory, sessionId, values)
    : {};

  if (mode.json) {
    writeJson({ ok: true, session: buildJsonSession(summary, values.full === true, data) });
    return 0;
  }

  renderSessionMeta(summary);
  renderWasteSection(summary);

  if (data.bootstrapBreakdown) renderBootstrapSection(data.bootstrapBreakdown);
  if (data.toolCostView?.tools.length) renderToolCostSection(data.toolCostView);
  if (data.timeline?.entries.length) renderTimelineSection(data.timeline);
  if (data.skillAttribution?.entries.length) renderSkillsSection(data.skillAttribution);

  return 0;
}

function projectSummary(summary: SessionUsageSummary, includeTurns: boolean): unknown {
  if (includeTurns) return summary;
  const { turns: _turns, ...rest } = summary;
  return rest;
}

function buildJsonSession(
  summary: SessionUsageSummary,
  includeFull: boolean,
  data: TranscriptData
): Record<string, unknown> {
  const base = projectSummary(summary, includeFull) as Record<string, unknown>;
  const { timeline, skillAttribution, toolCostView, bootstrapBreakdown } = data;
  return {
    ...base,
    ...(timeline ? { timeline } : {}),
    ...(skillAttribution ? { skillAttribution } : {}),
    ...(toolCostView ? { toolCostView } : {}),
    ...(bootstrapBreakdown ? { bootstrapBreakdown } : {}),
  };
}

function renderSessionMeta(summary: SessionUsageSummary): void {
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
}

function renderWasteSection(summary: SessionUsageSummary): void {
  if (!summary.waste) return;
  // Waste signals populated on every summary from the current analytics fold;
  // older fixtures or partial folds will short-circuit here.
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

function renderBootstrapSection(breakdown: BootstrapBreakdown): void {
  writeLine("");
  writeLine(bold("Bootstrap context breakdown"));
  writeLine(
    `System prompt: ${breakdown.systemPromptBytes.toLocaleString()} bytes  (~${breakdown.estimatedSystemPromptTokens.toLocaleString()} tokens)`
  );
  if (breakdown.components.length === 0) {
    writeLine(dim("  (no components detected)"));
    return;
  }
  writeLine("");
  const rows = breakdown.components.map((c) => [
    kindLabel(c.kind),
    c.name.length > 60 ? `\u2026${c.name.slice(-59)}` : c.name,
    c.sizeBytes.toLocaleString(),
    `~${c.estimatedTokens.toLocaleString()}`,
  ]);
  writeLine(renderTable(["Kind", "Name", "Bytes", "Est. tokens"], rows));
}

function renderToolCostSection(view: ToolCostView): void {
  writeLine("");
  writeLine(bold("Tool token attribution"));
  writeLine(
    `Total calls: ${view.totalToolCalls}  attributed output tokens: ${view.totalAttributedOutputTokens.toLocaleString()}`
  );
  writeLine("");
  const rows = view.tools
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

function renderTimelineSection(timeline: TurnTimeline): void {
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

function renderSkillsSection(attribution: SkillTurnAttribution): void {
  const allSkills = new Set<string>();
  for (const e of attribution.entries) {
    for (const s of e.skillsActiveCumulative) allSkills.add(s);
  }
  if (allSkills.size === 0) return;
  writeLine("");
  writeLine(bold("Skills active in session"));
  const skillList = Array.from(allSkills).sort();
  for (const skill of skillList) {
    const firstTurn = attribution.entries.find((e) => e.skillsActivatedOnThisTurn.includes(skill));
    writeLine(`  ${skill}${firstTurn !== undefined ? dim(` (turn ${firstTurn.turnIndex})`) : ""}`);
  }
}

import {
  ClaudeCodeAnalyticsSource,
  buildWeightedWorkflowHealthReport,
} from "@control-plane/adapter-claude-code";

import { resolveOrExplain } from "../data-root.js";
import { parseFlags, readIntFlag } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

export async function runWorkflowHealth(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    limit?: string;
    baseline?: string;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    limit: { type: "string" },
    baseline: { type: "string" },
  });

  const mode = resolveOutputMode(values);
  const limit = readIntFlag(values.limit, 20, "limit");
  const baselineDays = readIntFlag(values.baseline, 7, "baseline");

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const summaries = await source.listSessionSummaries();
  const report = buildWeightedWorkflowHealthReport(summaries, {
    baselineDays,
  });

  if (mode.json) {
    writeJson({ ok: true, report });
    return 0;
  }

  writeLine(bold(`Workflow Health Report — ${report.project}`));
  writeLine(`Generated: ${report.generatedAt}`);
  writeLine(`Sessions analyzed: ${report.sessionsAnalyzed}`);
  writeLine("");

  writeLine(bold("Score Summary"));
  writeLine(`  Weighted average: ${report.weightedAverageScore}/100`);
  writeLine(`  Baseline (older): ${report.baselineScore}/100`);
  writeLine(`  Recent: ${report.recentScore}/100`);
  writeLine(`  Trend: ${report.scoreTrend}`);
  writeLine("");

  if (report.delta) {
    writeLine(bold("Delta Analysis (Recent vs Baseline)"));
    if (report.delta.issuesResolved.length > 0) {
      writeLine(`  Improved: ${report.delta.issuesResolved.join(", ")}`);
    }
    if (report.delta.issuesPersistent.length > 0) {
      writeLine(`  Persistent: ${report.delta.issuesPersistent.join(", ")}`);
    }
    if (report.delta.issuesNew.length > 0) {
      writeLine(`  New issues: ${report.delta.issuesNew.join(", ")}`);
    }
    writeLine("");
  }

  if (report.appliedFixes.length > 0) {
    writeLine(bold("Applied Fixes"));
    for (const fix of report.appliedFixes) {
      writeLine(`  [${fix.category}] ${fix.title} (${fix.appliedAt.slice(0, 10)})`);
    }
    writeLine("");
  }

  const sessionsToShow = report.sessions.slice(0, limit);
  writeLine(bold(`Top ${sessionsToShow.length} Sessions (by recency-weighted score)`));
  if (sessionsToShow.length === 0) {
    writeLine("No sessions found.");
    return 0;
  }

  const rows = sessionsToShow.map((s) => [
    s.sessionId.slice(0, 8),
    s.date.slice(0, 10),
    s.branch,
    s.worktree ? "✓" : "✗",
    s.ciFriction,
    `${s.durationHours.toFixed(1)}h`,
    `${s.rawScore}`,
    `${Math.round(s.weight * 100)}%`,
    s.wasteVerdict.flags[0] ? s.wasteVerdict.flags[0].slice(0, 30) : "-",
  ]);
  writeLine(
    renderTable(
      ["session", "date", "branch", "wt", "ci-friction", "duration", "score", "weight", "top-flag"],
      rows
    )
  );

  return 0;
}

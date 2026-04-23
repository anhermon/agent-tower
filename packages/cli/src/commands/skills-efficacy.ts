import { computeSkillsEfficacy, type SkillEfficacyRow } from "@control-plane/adapter-claude-code";
import { resolveOrExplain } from "../data-root.js";
import { parseFlags, readIntFlag } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

export async function runSkillsEfficacy(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    "negative-only"?: boolean;
    "min-sessions"?: string;
    limit?: string;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    "negative-only": { type: "boolean" },
    "min-sessions": { type: "string" },
    limit: { type: "string" },
  });

  const mode = resolveOutputMode(values);
  const minSessions = readIntFlag(values["min-sessions"], 3, "min-sessions");
  const limit = readIntFlag(values.limit, 20, "limit");
  const negativeOnly = values["negative-only"] === true;

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const result = await computeSkillsEfficacy({ minSessionsForQualifying: minSessions });
  if (!result.ok) {
    if (mode.json) {
      writeJson({ ok: false, reason: result.reason, message: result.message });
      return 1;
    }
    writeLine(
      `Failed to compute skills efficacy: ${result.reason}${result.message ? ` — ${result.message}` : ""}`
    );
    return 1;
  }

  const qualifying = result.report.qualifying;
  let rows: readonly SkillEfficacyRow[];
  if (negativeOnly) {
    rows = [...qualifying].filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);
  } else {
    rows = [...qualifying].sort((a, b) => b.delta - a.delta);
  }
  const sliced = rows.slice(0, Math.max(1, limit));

  if (mode.json) {
    writeJson({
      ok: true,
      baseline: result.report.baseline,
      sessionsAnalyzed: result.report.sessionsAnalyzed,
      sessionsWithSkill: result.report.sessionsWithSkill,
      outcomeDistribution: result.report.outcomeDistribution,
      rows: sliced,
    });
    return 0;
  }

  writeLine(bold("Skills efficacy"));
  writeLine("");
  writeLine(
    `Sessions analyzed: ${result.report.sessionsAnalyzed} (with at least one skill: ${result.report.sessionsWithSkill})`
  );
  writeLine(
    `Baseline effective score: ${result.report.baseline.effectiveScore.toFixed(3)} ` +
      `(satisfaction ${result.report.baseline.satisfaction.toFixed(3)}, outcome ${result.report.baseline.outcomeMultiplier.toFixed(3)})`
  );
  writeLine("");
  if (sliced.length === 0) {
    writeLine(
      negativeOnly ? "No qualifying skills underperform the baseline." : "No qualifying skills yet."
    );
    return 0;
  }
  const table = sliced.map((r) => [
    r.displayName,
    r.known ? "known" : "unknown",
    String(r.sessionsCount),
    r.avgEffectiveScore.toFixed(3),
    formatDelta(r.delta),
    `${r.outcomeBreakdown.completed}/${r.outcomeBreakdown.partial}/${r.outcomeBreakdown.abandoned}/${r.outcomeBreakdown.unknown}`,
  ]);
  writeLine(renderTable(["skill", "status", "sessions", "effective", "delta", "c/p/a/u"], table));
  return 0;
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(3)}`;
}

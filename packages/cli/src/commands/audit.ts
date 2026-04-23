import {
  ClaudeCodeAnalyticsSource,
  computeSkillsEfficacy,
  computeSkillsUsage,
  type SkillEfficacyRow,
  type SkillUsageStats,
  scoreSessionsWaste,
} from "@control-plane/adapter-claude-code";
import type { SessionUsageSummary, WasteVerdict } from "@control-plane/core";
import { resolveOrExplain } from "../data-root.js";
import { parseFlags, readDateFlag, readIntFlag } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

/**
 * Single-shot holistic audit — combines cost/usage/waste/skills signals into
 * one structured report. Pretty mode prints a dense one-screen summary; JSON
 * mode returns the full shape so tooling can diff baselines over time.
 */

export interface ProjectedAuditSession {
  readonly sessionId: string;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly turnCount: number;
  readonly model: string | null;
  readonly cwd: string | null;
  readonly startTime: string | null;
}

export interface AuditProjectRow {
  readonly projectId: string;
  readonly sessions: number;
  readonly totalCostUsd: number;
  readonly avgWasteScore: number;
}

export interface AuditWasteAggregates {
  readonly avgOverall: number;
  readonly avgCacheThrash: number;
  readonly avgSequentialTools: number;
  readonly avgToolPollution: number;
  readonly avgContextBloat: number;
  readonly bloatWithoutCompactionCount: number;
  readonly highWasteSessionCount: number;
  readonly sessionsWithWasteSignals: number;
}

export interface AuditColdGiant {
  readonly name: string;
  readonly sizeBytes: number;
  readonly invocationCount: number;
}

export interface AuditNegativeEfficacy {
  readonly name: string;
  readonly delta: number;
  readonly sessions: number;
}

export interface AuditReport {
  readonly ok: true;
  readonly dataRoot: string;
  readonly sessionsScanned: number;
  readonly totalEstimatedCostUsd: number;
  readonly topByCost: readonly ProjectedAuditSession[];
  readonly topByWaste: readonly WasteVerdict[];
  readonly wasteAggregates: AuditWasteAggregates;
  readonly skillsColdGiants: readonly AuditColdGiant[];
  readonly skillsNegativeEfficacy: readonly AuditNegativeEfficacy[];
  readonly topProjects: readonly AuditProjectRow[];
}

/** Skills threshold: bigger than 8kB manifest AND fewer than 5 invocations. */
const COLD_GIANT_BYTES = 8000;
const COLD_GIANT_MAX_INVOCATIONS = 5;
/** Efficacy threshold: clearly negative delta, at least 5 qualifying sessions. */
const NEGATIVE_DELTA = -0.05;
const NEGATIVE_MIN_SESSIONS = 5;
/** High-waste session threshold for the aggregate count. */
const HIGH_WASTE_OVERALL = 0.4;

export interface BuildAuditInput {
  readonly summaries: readonly SessionUsageSummary[];
  readonly skillsUsage?: readonly SkillUsageStats[];
  readonly skillsEfficacy?: readonly SkillEfficacyRow[];
  readonly dataRoot: string;
  readonly limit: number;
}

/**
 * Pure audit builder. Receives already-loaded inputs so tests can feed in
 * fixtures without touching disk or env vars.
 */
export function buildAudit(input: BuildAuditInput): AuditReport {
  const { summaries, skillsUsage = [], skillsEfficacy = [], dataRoot, limit } = input;
  const effectiveLimit = Math.max(1, limit);

  const totalEstimatedCostUsd = summaries.reduce((a, s) => a + s.estimatedCostUsd, 0);

  const topByCost = [...summaries]
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, effectiveLimit)
    .map(projectSession);

  const verdicts = scoreSessionsWaste(summaries);
  const topByWaste = [...verdicts].sort((a, b) => b.overall - a.overall).slice(0, effectiveLimit);

  const wasteAggregates = computeAggregates(summaries, verdicts);

  const skillsColdGiants: readonly AuditColdGiant[] = [...skillsUsage]
    .filter((s) => s.sizeBytes > COLD_GIANT_BYTES && s.invocationCount < COLD_GIANT_MAX_INVOCATIONS)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .map((s) => ({
      name: s.displayName,
      sizeBytes: s.sizeBytes,
      invocationCount: s.invocationCount,
    }));

  const skillsNegativeEfficacy: readonly AuditNegativeEfficacy[] = [...skillsEfficacy]
    .filter((r) => r.delta < NEGATIVE_DELTA && r.sessionsCount >= NEGATIVE_MIN_SESSIONS)
    .sort((a, b) => a.delta - b.delta)
    .map((r) => ({
      name: r.displayName,
      delta: r.delta,
      sessions: r.sessionsCount,
    }));

  const topProjects = aggregateProjects(summaries, verdicts).slice(0, effectiveLimit);

  return {
    ok: true,
    dataRoot,
    sessionsScanned: summaries.length,
    totalEstimatedCostUsd,
    topByCost,
    topByWaste,
    wasteAggregates,
    skillsColdGiants,
    skillsNegativeEfficacy,
    topProjects,
  };
}

function projectSession(summary: SessionUsageSummary): ProjectedAuditSession {
  return {
    sessionId: summary.sessionId,
    totalTokens: summary.usage.inputTokens + summary.usage.outputTokens,
    estimatedCostUsd: summary.estimatedCostUsd,
    turnCount: summary.userMessageCount + summary.assistantMessageCount,
    model: summary.model,
    cwd: summary.cwd ?? null,
    startTime: summary.startTime ?? null,
  };
}

function computeAggregates(
  summaries: readonly SessionUsageSummary[],
  verdicts: readonly WasteVerdict[]
): AuditWasteAggregates {
  // Only average across sessions with populated waste signals so fixture / old
  // summaries don't drag the mean toward zero.
  const withWaste = summaries.filter((s) => s.waste !== undefined);
  const n = withWaste.length;
  const verdictById = new Map(verdicts.map((v) => [v.sessionId, v] as const));

  let sumOverall = 0;
  let sumCacheThrash = 0;
  let sumSequentialTools = 0;
  let sumToolPollution = 0;
  let sumContextBloat = 0;
  let bloatWithoutCompactionCount = 0;
  let highWasteSessionCount = 0;

  for (const summary of withWaste) {
    const v = verdictById.get(summary.sessionId);
    if (!v) continue;
    sumOverall += v.overall;
    sumCacheThrash += v.scores.cacheThrash;
    sumSequentialTools += v.scores.sequentialTools;
    sumToolPollution += v.scores.toolPollution;
    sumContextBloat += v.scores.contextBloat;
    if (summary.waste?.bloatWithoutCompaction) bloatWithoutCompactionCount += 1;
    if (v.overall > HIGH_WASTE_OVERALL) highWasteSessionCount += 1;
  }

  const avg = (sum: number): number => (n === 0 ? 0 : sum / n);

  return {
    avgOverall: avg(sumOverall),
    avgCacheThrash: avg(sumCacheThrash),
    avgSequentialTools: avg(sumSequentialTools),
    avgToolPollution: avg(sumToolPollution),
    avgContextBloat: avg(sumContextBloat),
    bloatWithoutCompactionCount,
    highWasteSessionCount,
    sessionsWithWasteSignals: n,
  };
}

function aggregateProjects(
  summaries: readonly SessionUsageSummary[],
  verdicts: readonly WasteVerdict[]
): readonly AuditProjectRow[] {
  const verdictById = new Map(verdicts.map((v) => [v.sessionId, v] as const));
  interface Accumulator {
    sessions: number;
    totalCostUsd: number;
    wasteSum: number;
    wasteCount: number;
  }
  const byProject = new Map<string, Accumulator>();

  for (const summary of summaries) {
    const projectId = summary.cwd ?? "(unknown)";
    const acc = byProject.get(projectId) ?? {
      sessions: 0,
      totalCostUsd: 0,
      wasteSum: 0,
      wasteCount: 0,
    };
    acc.sessions += 1;
    acc.totalCostUsd += summary.estimatedCostUsd;
    const v = verdictById.get(summary.sessionId);
    if (v && summary.waste !== undefined) {
      acc.wasteSum += v.overall;
      acc.wasteCount += 1;
    }
    byProject.set(projectId, acc);
  }

  return [...byProject.entries()]
    .map(([projectId, acc]) => ({
      projectId,
      sessions: acc.sessions,
      totalCostUsd: acc.totalCostUsd,
      avgWasteScore: acc.wasteCount === 0 ? 0 : acc.wasteSum / acc.wasteCount,
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

export async function runAudit(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    limit?: string;
    since?: string;
    until?: string;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    limit: { type: "string" },
    since: { type: "string" },
    until: { type: "string" },
  });

  const mode = resolveOutputMode(values);
  const limit = readIntFlag(values.limit, 20, "limit");
  const since = readDateFlag(values.since, "since");
  const until = readDateFlag(values.until, "until");

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const filter = since && until ? { range: { from: since, to: until } } : undefined;
  const summaries = await source.listSessionSummaries(filter);

  // Skills data is best-effort — if it can't be loaded (unconfigured roots,
  // unreadable manifests) the audit still has value, so we silently fall
  // back to empty arrays rather than failing the whole command.
  const [usageResult, efficacyResult] = await Promise.all([
    computeSkillsUsage().catch(() => null),
    computeSkillsEfficacy().catch(() => null),
  ]);
  const skillsUsage = usageResult?.ok ? usageResult.report.perSkill : [];
  const skillsEfficacy = efficacyResult?.ok ? efficacyResult.report.qualifying : [];

  const report = buildAudit({
    summaries,
    skillsUsage,
    skillsEfficacy,
    dataRoot: resolved.directory,
    limit,
  });

  if (mode.json) {
    writeJson(report);
    return 0;
  }

  renderPretty(report);
  return 0;
}

function renderPretty(report: AuditReport): void {
  writeLine(bold("cp audit"));
  writeLine("");
  writeLine(`Data root:         ${report.dataRoot}`);
  writeLine(`Sessions scanned:  ${report.sessionsScanned}`);
  writeLine(`Total cost:        $${report.totalEstimatedCostUsd.toFixed(4)}`);
  writeLine(
    `Waste-signaled:    ${report.wasteAggregates.sessionsWithWasteSignals} / ${report.sessionsScanned}`
  );
  writeLine("");

  writeLine(bold("Top sessions by cost"));
  if (report.topByCost.length === 0) {
    writeLine("  (none)");
  } else {
    const rows = report.topByCost.map((s) => [
      s.sessionId,
      s.model ?? "-",
      `$${s.estimatedCostUsd.toFixed(4)}`,
      String(s.totalTokens),
      String(s.turnCount),
    ]);
    writeLine(renderTable(["session", "model", "cost", "tokens", "turns"], rows));
  }
  writeLine("");

  writeLine(bold("Top sessions by waste"));
  if (report.topByWaste.length === 0) {
    writeLine("  (none)");
  } else {
    const rows = report.topByWaste.map((v) => [
      v.overall.toFixed(3),
      v.sessionId,
      v.flags[0] ?? "-",
    ]);
    writeLine(renderTable(["score", "session", "top flag"], rows));
  }
  writeLine("");

  writeLine(bold("Waste aggregates"));
  const a = report.wasteAggregates;
  writeLine(`  avg overall:          ${a.avgOverall.toFixed(3)}`);
  writeLine(`  avg cache thrash:     ${a.avgCacheThrash.toFixed(3)}`);
  writeLine(`  avg sequential tools: ${a.avgSequentialTools.toFixed(3)}`);
  writeLine(`  avg tool pollution:   ${a.avgToolPollution.toFixed(3)}`);
  writeLine(`  avg context bloat:    ${a.avgContextBloat.toFixed(3)}`);
  writeLine(`  bloat w/o compaction: ${a.bloatWithoutCompactionCount}`);
  writeLine(`  high-waste sessions:  ${a.highWasteSessionCount}`);
  writeLine("");

  writeLine(bold("Skills — cold giants (large manifest, low usage)"));
  if (report.skillsColdGiants.length === 0) {
    writeLine("  (none)");
  } else {
    const rows = report.skillsColdGiants.map((s) => [
      s.name,
      String(s.sizeBytes),
      String(s.invocationCount),
    ]);
    writeLine(renderTable(["skill", "size_bytes", "invocations"], rows));
  }
  writeLine("");

  writeLine(bold("Skills — negative efficacy (delta < -0.05, ≥5 sessions)"));
  if (report.skillsNegativeEfficacy.length === 0) {
    writeLine("  (none)");
  } else {
    const rows = report.skillsNegativeEfficacy.map((r) => [
      r.name,
      r.delta.toFixed(3),
      String(r.sessions),
    ]);
    writeLine(renderTable(["skill", "delta", "sessions"], rows));
  }
  writeLine("");

  writeLine(bold("Top projects by cost"));
  if (report.topProjects.length === 0) {
    writeLine("  (none)");
  } else {
    const rows = report.topProjects.map((p) => [
      p.projectId,
      String(p.sessions),
      `$${p.totalCostUsd.toFixed(4)}`,
      p.avgWasteScore.toFixed(3),
    ]);
    writeLine(renderTable(["project", "sessions", "cost", "avg_waste"], rows));
  }
}

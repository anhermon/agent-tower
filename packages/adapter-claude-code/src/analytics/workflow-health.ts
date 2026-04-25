import fs from "node:fs";

import type {
  AppliedFixReference,
  SessionOptimizationState,
  SessionUsageSummary,
  WasteVerdict,
} from "@control-plane/core";

import { scoreSessionWaste } from "./waste.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single fix from the applied-fixes tracker, enriched with its effect
 * assessment.
 */
export interface TrackedFix {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly appliedAt: string;
  readonly commit?: string;
  readonly status: "applied" | "pending" | "reverted";
}

/**
 * Session grouped by time period for baseline-vs-recent comparison.
 */
export interface SessionBucket {
  readonly label: string;
  readonly sessions: readonly SessionUsageSummary[];
  readonly startDate: string;
  readonly endDate: string;
}

/**
 * Per-dimension delta between baseline and recent sessions.
 */
export interface DimensionDelta {
  readonly dimension: string;
  readonly baselineAvg: number;
  readonly recentAvg: number;
  readonly delta: number; // negative = improved
  readonly direction: "improved" | "regressed" | "stable";
  readonly significance: "high" | "medium" | "low";
}

/**
 * Result of comparing recent sessions against baseline.
 */
export interface WorkflowHealthDelta {
  readonly baseline: SessionBucket;
  readonly recent: SessionBucket;
  readonly deltas: readonly DimensionDelta[];
  readonly issuesResolved: readonly string[];
  readonly issuesPersistent: readonly string[];
  readonly issuesNew: readonly string[];
  readonly scoreImprovement: number; // overall score delta
}

/**
 * Weighted workflow health report for a single session.
 */
export interface WeightedSessionHealth {
  readonly sessionId: string;
  readonly date: string;
  readonly weight: number; // 0..1 based on recency
  readonly rawScore: number; // 0..100 quick score
  readonly weightedScore: number; // rawScore * weight
  readonly branch: string;
  readonly worktree: boolean;
  readonly ciFriction: string;
  readonly skills: string;
  readonly durationHours: number;
  readonly wasteVerdict: WasteVerdict;
  readonly optimizationState: SessionOptimizationState | undefined;
  readonly appliedFixes: readonly AppliedFixReference[] | undefined;
}

/**
 * Aggregated weighted health report for a project.
 */
export interface WeightedWorkflowHealthReport {
  readonly project: string;
  readonly generatedAt: string;
  readonly sessionsAnalyzed: number;
  readonly weightedAverageScore: number;
  readonly baselineScore: number;
  readonly recentScore: number;
  readonly scoreTrend: "improving" | "stable" | "declining";
  readonly sessions: readonly WeightedSessionHealth[];
  readonly delta: WorkflowHealthDelta | undefined;
  readonly appliedFixes: readonly TrackedFix[];
  readonly unappliedFixes: readonly string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Half-life for exponential weighting: sessions older than this get weight 0.5. */
const WEIGHT_HALFLIFE_DAYS = 3;

/** Minimum sessions needed per bucket for statistical relevance. */
const MIN_BUCKET_SIZE = 2;

/** Dimensions tracked for delta analysis. */
const DELTA_DIMENSIONS = [
  { key: "sequentialToolTurnPct", label: "Sequential Tools", invert: false },
  { key: "toolFailurePct", label: "Tool Failure Rate", invert: false },
  { key: "cacheThrashRatio", label: "Cache Thrash", invert: false },
  { key: "peakInputTokensBetweenCompactions", label: "Context Bloat", invert: false },
  { key: "distinctToolCount", label: "Tool Pollution", invert: false },
] as const;

// ─── Quick score (from workflow-health skill) ────────────────────────────────

function computeQuickScore(summary: SessionUsageSummary): number {
  let score = 100;
  if (summary.gitBranch === "main") score -= 25;

  const w = summary.waste;
  if (w) {
    if (w.toolFailurePct > 0.2) score -= 25;
    else if (w.toolFailurePct > 0.05) score -= 10;

    if (w.sequentialToolTurnPct >= 0.95) score -= 20;
    else if (w.sequentialToolTurnPct >= 0.7) score -= 10;

    const totalTools = Object.values(summary.toolCounts).reduce((a, b) => a + b, 0);
    const bashPct = totalTools > 0 ? (summary.toolCounts.Bash ?? 0) / totalTools : 0;
    if (bashPct > 0.6) score -= 15;
    else if (bashPct > 0.4) score -= 5;
  }

  const hours = summary.durationMs ? summary.durationMs / 3_600_000 : 0;
  if (hours > 4) score -= 10;

  return Math.max(score, 0);
}

// ─── Recency weighting ───────────────────────────────────────────────────────

function computeRecencyWeight(sessionDate: string): number {
  const now = Date.now();
  const sessionTime = Date.parse(sessionDate);
  if (!Number.isFinite(sessionTime)) return 0.5;
  const ageDays = (now - sessionTime) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  return Math.exp(-(ageDays * Math.LN2) / WEIGHT_HALFLIFE_DAYS);
}

// ─── Applied fixes loader ────────────────────────────────────────────────────

export interface AppliedFixesFile {
  readonly schemaVersion: number;
  readonly project: string;
  readonly lastUpdated: string;
  readonly fixes: readonly TrackedFix[];
  readonly pending: readonly TrackedFix[];
  readonly reverted: readonly TrackedFix[];
}

export function loadAppliedFixes(fixesPath?: string): AppliedFixesFile {
  // Default: look for .claude/workflow-applied-fixes.json in cwd
  const path = fixesPath ?? ".claude/workflow-applied-fixes.json";
  try {
    const raw = fs.readFileSync(path, "utf-8");
    return JSON.parse(raw) as AppliedFixesFile;
  } catch {
    return {
      schemaVersion: 1,
      project: "unknown",
      lastUpdated: new Date().toISOString(),
      fixes: [],
      pending: [],
      reverted: [],
    };
  }
}

export function getActiveFixesForSession(
  sessionDate: string,
  fixes: readonly TrackedFix[]
): AppliedFixReference[] {
  const sessionTime = Date.parse(sessionDate);
  return fixes
    .filter((f) => f.status === "applied" && Date.parse(f.appliedAt) <= sessionTime)
    .map((f) => ({
      fixId: f.id,
      category: f.category,
      appliedAt: f.appliedAt,
      commit: f.commit,
    }));
}

// ─── Main report builder ─────────────────────────────────────────────────────

export interface BuildReportOptions {
  readonly project?: string;
  readonly fixesPath?: string;
  readonly baselineDays?: number;
}

export function buildWeightedWorkflowHealthReport(
  sessions: readonly SessionUsageSummary[],
  options: BuildReportOptions = {}
): WeightedWorkflowHealthReport {
  const project = options.project ?? "unknown";
  const fixesFile = loadAppliedFixes(options.fixesPath);
  const allFixes = [...fixesFile.fixes, ...fixesFile.pending];

  // Sort by date descending (most recent first).
  const sorted = [...sessions].sort((a, b) => {
    const ta = a.startTime ? Date.parse(a.startTime) : 0;
    const tb = b.startTime ? Date.parse(b.startTime) : 0;
    return tb - ta;
  });

  const now = new Date().toISOString();

  // Build weighted session health rows.
  const weightedSessions: WeightedSessionHealth[] = sorted.map((s) => {
    const date = s.startTime ?? "";
    const weight = computeRecencyWeight(date);
    const rawScore = computeQuickScore(s);
    const waste = scoreSessionWaste(s);
    const activeFixes = date ? getActiveFixesForSession(date, allFixes) : [];
    const isWorktree = s.cwd ? s.cwd.includes(".worktrees/") : false;

    const totalTools = Object.values(s.toolCounts).reduce((a, b) => a + b, 0);
    const bashPct = totalTools > 0 ? (s.toolCounts.Bash ?? 0) / totalTools : 0;
    const ciFriction =
      bashPct > 0.6
        ? `HIGH (${Math.round(bashPct * 100)}% bash)`
        : bashPct > 0.4
          ? `MED (${Math.round(bashPct * 100)}% bash)`
          : `LOW (${Math.round(bashPct * 100)}% bash)`;

    return {
      sessionId: s.sessionId,
      date,
      weight,
      rawScore,
      weightedScore: rawScore * weight,
      branch: s.gitBranch ?? "unknown",
      worktree: isWorktree,
      ciFriction,
      skills: "none", // populated separately if skill data available
      durationHours: s.durationMs ? s.durationMs / 3_600_000 : 0,
      wasteVerdict: waste,
      optimizationState: s.optimizationState,
      appliedFixes: activeFixes,
    };
  });

  // Split into baseline (older) and recent.
  const baselineDays = options.baselineDays ?? 7;
  const cutoffTime = Date.now() - baselineDays * 24 * 60 * 60 * 1000;

  const recentSessions = sorted.filter((s) => s.startTime && Date.parse(s.startTime) >= cutoffTime);
  const baselineSessions = sorted.filter(
    (s) => s.startTime && Date.parse(s.startTime) < cutoffTime
  );

  // Compute delta if both buckets have enough data.
  const delta =
    baselineSessions.length >= MIN_BUCKET_SIZE && recentSessions.length >= MIN_BUCKET_SIZE
      ? computeDelta(baselineSessions, recentSessions)
      : undefined;

  // Overall scores.
  const totalWeight = weightedSessions.reduce((sum, s) => sum + s.weight, 0);
  const weightedAvg =
    totalWeight > 0
      ? weightedSessions.reduce((sum, s) => sum + s.weightedScore, 0) / totalWeight
      : 0;

  const baselineScore =
    baselineSessions.length > 0
      ? baselineSessions.reduce((sum, s) => sum + computeQuickScore(s), 0) / baselineSessions.length
      : 0;

  const recentScore =
    recentSessions.length > 0
      ? recentSessions.reduce((sum, s) => sum + computeQuickScore(s), 0) / recentSessions.length
      : 0;

  const scoreTrend =
    recentScore > baselineScore + 5
      ? "improving"
      : recentScore < baselineScore - 5
        ? "declining"
        : "stable";

  const unappliedFixes = fixesFile.pending.map((f) => f.title);

  return {
    project,
    generatedAt: now,
    sessionsAnalyzed: sessions.length,
    weightedAverageScore: Math.round(weightedAvg),
    baselineScore: Math.round(baselineScore),
    recentScore: Math.round(recentScore),
    scoreTrend,
    sessions: weightedSessions,
    delta,
    appliedFixes: fixesFile.fixes,
    unappliedFixes,
  };
}

// ─── Delta computation ───────────────────────────────────────────────────────

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function wasteVals(sessions: readonly SessionUsageSummary[], key: string): number[] {
  return sessions
    .map((s) => s.waste?.[key as keyof SessionUsageSummary["waste"]] as number | undefined)
    .filter((v): v is number => v !== undefined && !Number.isNaN(v));
}

function significanceLevel(sampleSize: number, magnitude: number): "high" | "medium" | "low" {
  if (sampleSize >= 5 && magnitude > 0.1) return "high";
  if (sampleSize >= 3 && magnitude > 0.05) return "medium";
  return "low";
}

function computeDimensionDelta(
  dim: { key: string; label: string },
  baseline: readonly SessionUsageSummary[],
  recent: readonly SessionUsageSummary[]
): DimensionDelta {
  const baselineVals = wasteVals(baseline, dim.key);
  const recentVals = wasteVals(recent, dim.key);
  const baselineAvg = avg(baselineVals);
  const recentAvg = avg(recentVals);
  const delta = recentAvg - baselineAvg;
  const sampleSize = Math.min(baselineVals.length, recentVals.length);
  const significance = significanceLevel(sampleSize, Math.abs(delta));
  const direction: "improved" | "regressed" | "stable" =
    Math.abs(delta) < 0.02 ? "stable" : delta > 0 ? "regressed" : "improved";
  return { dimension: dim.label, baselineAvg, recentAvg, delta, direction, significance };
}

function classifyIssues(deltas: DimensionDelta[]): {
  issuesResolved: string[];
  issuesPersistent: string[];
  issuesNew: string[];
} {
  const issuesResolved: string[] = [];
  const issuesPersistent: string[] = [];
  const issuesNew: string[] = [];
  for (const d of deltas) {
    if (d.direction === "improved" && d.significance !== "low") issuesResolved.push(d.dimension);
    else if (d.direction === "stable" && d.recentAvg > 0.3) issuesPersistent.push(d.dimension);
    else if (d.direction === "regressed" && d.significance !== "low") issuesNew.push(d.dimension);
  }
  return { issuesResolved, issuesPersistent, issuesNew };
}

function computeDelta(
  baseline: readonly SessionUsageSummary[],
  recent: readonly SessionUsageSummary[]
): WorkflowHealthDelta {
  const baselineLabel = `${baseline[0]?.startTime?.slice(0, 10) ?? "?"} → ${baseline[baseline.length - 1]?.startTime?.slice(0, 10) ?? "?"}`;
  const recentLabel = `${recent[0]?.startTime?.slice(0, 10) ?? "?"} → ${recent[recent.length - 1]?.startTime?.slice(0, 10) ?? "?"}`;
  const deltas = DELTA_DIMENSIONS.map((dim) => computeDimensionDelta(dim, baseline, recent));
  const baselineScore = avg(baseline.map((s) => computeQuickScore(s)));
  const recentScore = avg(recent.map((s) => computeQuickScore(s)));
  const { issuesResolved, issuesPersistent, issuesNew } = classifyIssues(deltas);

  return {
    baseline: {
      label: baselineLabel,
      sessions: baseline,
      startDate: baseline[0]?.startTime ?? "",
      endDate: baseline[baseline.length - 1]?.startTime ?? "",
    },
    recent: {
      label: recentLabel,
      sessions: recent,
      startDate: recent[0]?.startTime ?? "",
      endDate: recent[recent.length - 1]?.startTime ?? "",
    },
    deltas,
    issuesResolved,
    issuesPersistent,
    issuesNew,
    scoreImprovement: baselineScore - recentScore,
  };
}

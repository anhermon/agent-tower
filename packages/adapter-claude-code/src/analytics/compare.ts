/**
 * Cross-harness + model comparison analytics.
 *
 * Pure folds — no I/O, no global clocks. Pass pre-loaded `SessionUsageSummary`
 * arrays; get back comparison results ready for CLI or dashboard rendering.
 *
 * Harness labels are derived from the model string by stripping the trailing
 * date suffix (e.g. "claude-3-5-sonnet-20241022" → "claude-3-5-sonnet"). This
 * works for the current Claude Code adapter; callers that ingest multi-runtime
 * data should normalise model strings before calling these functions.
 */
import type { SessionOptimizationState, SessionUsageSummary } from "@control-plane/core";

import { scoreSessionWaste } from "./waste.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ModelMetrics {
  /** Full model identifier, e.g. "claude-3-5-sonnet-20241022". */
  readonly model: string;
  readonly sessionCount: number;
  readonly totalCostUsd: number;
  readonly costPerSession: number;
  /** Median (tokens-in + tokens-out) / turn across sessions. */
  readonly medianTokensPerTurn: number;
  /** 95th-percentile tokens/turn across sessions. */
  readonly p95TokensPerTurn: number;
  /** cacheRead / (cacheRead + cacheCreation); 0 when no cache traffic. */
  readonly cacheHitRate: number;
  /** Average waste overall score (0..1) across sessions. */
  readonly avgWasteScore: number;
  /** Fraction of sessions using each optimisation feature (0..1). */
  readonly featureUsageRates: Readonly<Record<string, number>>;
}

export interface HarnessMetrics {
  /** Model-family label, e.g. "claude-3-5-sonnet" or "unknown". */
  readonly harness: string;
  readonly sessionCount: number;
  /** estimatedCostUsd / outputTokens ($/token); 0 when outputTokens=0. */
  readonly costPerOutputToken: number;
  /** cacheRead / (cacheRead + cacheCreation) across all sessions. */
  readonly cacheEfficiency: number;
  /** Average waste score (0..1) across sessions. */
  readonly wasteRate: number;
  readonly medianCostPerSession: number;
  readonly totalCostUsd: number;
}

export interface FeatureMatrixCell {
  /** Fraction of sessions that used this feature (0..1). */
  readonly usageRate: number;
  /** Absolute count of sessions that used it. */
  readonly sessionCount: number;
}

export interface FeatureMatrixRow {
  /** Feature name, e.g. "compaction", "thinking", "mcp". */
  readonly feature: string;
  /** Keyed by harness label → cell. */
  readonly byHarness: Readonly<Record<string, FeatureMatrixCell>>;
}

export interface FeatureMatrix {
  /** All harness labels encountered, in sorted order. */
  readonly harnesses: readonly string[];
  readonly rows: readonly FeatureMatrixRow[];
}

export interface SessionSnapshot {
  readonly sessionId: string;
  readonly model: string | null;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  /** cacheRead / (cacheRead + cacheCreation); 0 when no cache traffic. */
  readonly cacheHitRate: number;
  /** userMessageCount + assistantMessageCount. */
  readonly turns: number;
  /** Overall waste score 0..1. */
  readonly wasteScore: number;
  readonly cwd: string | undefined;
  readonly startTime: string | undefined;
}

export interface ABSessionDiff {
  readonly a: SessionSnapshot;
  readonly b: SessionSnapshot;
  /** b − a for every numeric field. */
  readonly delta: {
    readonly tokens: number;
    readonly cost: number;
    readonly cacheHitRate: number;
    readonly turns: number;
    readonly wasteScore: number;
  };
}

// ─── Feature key table ────────────────────────────────────────────────────────

type OptStateKey = keyof SessionOptimizationState;

const FEATURE_KEYS: readonly { readonly key: OptStateKey; readonly label: string }[] = [
  { key: "compactionUsed", label: "compaction" },
  { key: "thinkingEnabled", label: "thinking" },
  { key: "taskAgentEnabled", label: "task-agent" },
  { key: "mcpEnabled", label: "mcp" },
  { key: "webSearchEnabled", label: "web-search" },
  { key: "webFetchEnabled", label: "web-fetch" },
  { key: "cacheReadUsed", label: "cache-read" },
  { key: "ephemeralCacheUsed", label: "ephemeral-cache" },
];

// ─── Harness label ────────────────────────────────────────────────────────────

/**
 * Derives a short harness label from a model identifier string.
 *
 * Examples:
 *   "claude-3-5-sonnet-20241022" → "claude-3-5-sonnet"
 *   "claude-opus-4-6"            → "claude-opus-4-6"
 *   null / undefined             → "unknown"
 *
 * Strips a trailing 8-digit date suffix only (YYYYMMDD). Other suffixes are
 * kept intact so distinct minor versions remain distinguishable.
 */
export function harnessLabel(model: string | null | undefined): string {
  if (!model) return "unknown";
  return model.replace(/-\d{8}$/, "");
}

// ─── Percentile helper ────────────────────────────────────────────────────────

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx] ?? 0;
}

// ─── Model comparison ─────────────────────────────────────────────────────────

/**
 * Aggregates session summaries by model string and returns per-model metrics
 * sorted by total cost descending.
 */
export function compareByModel(summaries: readonly SessionUsageSummary[]): readonly ModelMetrics[] {
  const byModel = new Map<string, SessionUsageSummary[]>();
  for (const s of summaries) {
    const key = s.model ?? "unknown";
    let group = byModel.get(key);
    if (!group) {
      group = [];
      byModel.set(key, group);
    }
    group.push(s);
  }

  const results: ModelMetrics[] = [];
  for (const [model, group] of byModel) {
    results.push(buildModelMetrics(model, group));
  }
  return results.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

function buildModelMetrics(model: string, group: readonly SessionUsageSummary[]): ModelMetrics {
  const n = group.length;
  if (n === 0) {
    return emptyModelMetrics(model);
  }

  const totalCostUsd = group.reduce((acc, s) => acc + s.estimatedCostUsd, 0);

  const tokensPerTurn = group
    .map((s) => {
      const turns = s.userMessageCount + s.assistantMessageCount;
      const total = s.usage.inputTokens + s.usage.outputTokens;
      return turns > 0 ? total / turns : 0;
    })
    .sort((a, b) => a - b);

  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  for (const s of group) {
    totalCacheRead += s.usage.cacheReadInputTokens;
    totalCacheCreation += s.usage.cacheCreationInputTokens;
  }
  const cacheDenominator = totalCacheRead + totalCacheCreation;
  const cacheHitRate = cacheDenominator > 0 ? totalCacheRead / cacheDenominator : 0;

  const wasteScores = group.map((s) => scoreSessionWaste(s).overall);
  const avgWasteScore = wasteScores.reduce((acc, w) => acc + w, 0) / n;

  const featureUsageRates: Record<string, number> = {};
  for (const { key, label } of FEATURE_KEYS) {
    const count = group.filter((s) => s.optimizationState?.[key] === true).length;
    featureUsageRates[label] = count / n;
  }

  return {
    model,
    sessionCount: n,
    totalCostUsd,
    costPerSession: totalCostUsd / n,
    medianTokensPerTurn: percentile(tokensPerTurn, 50),
    p95TokensPerTurn: percentile(tokensPerTurn, 95),
    cacheHitRate,
    avgWasteScore,
    featureUsageRates,
  };
}

function emptyModelMetrics(model: string): ModelMetrics {
  return {
    model,
    sessionCount: 0,
    totalCostUsd: 0,
    costPerSession: 0,
    medianTokensPerTurn: 0,
    p95TokensPerTurn: 0,
    cacheHitRate: 0,
    avgWasteScore: 0,
    featureUsageRates: {},
  };
}

// ─── Harness comparison ───────────────────────────────────────────────────────

/**
 * Aggregates sessions by derived harness label and returns efficiency metrics
 * sorted by cache efficiency descending.
 */
export function compareByHarness(
  summaries: readonly SessionUsageSummary[]
): readonly HarnessMetrics[] {
  const byHarness = new Map<string, SessionUsageSummary[]>();
  for (const s of summaries) {
    const key = harnessLabel(s.model);
    let group = byHarness.get(key);
    if (!group) {
      group = [];
      byHarness.set(key, group);
    }
    group.push(s);
  }

  const results: HarnessMetrics[] = [];
  for (const [harness, group] of byHarness) {
    results.push(buildHarnessMetrics(harness, group));
  }
  return results.sort((a, b) => b.cacheEfficiency - a.cacheEfficiency);
}

function buildHarnessMetrics(
  harness: string,
  group: readonly SessionUsageSummary[]
): HarnessMetrics {
  const n = group.length;
  if (n === 0) {
    return emptyHarnessMetrics(harness);
  }

  const totalCostUsd = group.reduce((acc, s) => acc + s.estimatedCostUsd, 0);
  const totalOutputTokens = group.reduce((acc, s) => acc + s.usage.outputTokens, 0);
  const costPerOutputToken = totalOutputTokens > 0 ? totalCostUsd / totalOutputTokens : 0;

  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  for (const s of group) {
    totalCacheRead += s.usage.cacheReadInputTokens;
    totalCacheCreation += s.usage.cacheCreationInputTokens;
  }
  const cacheDenominator = totalCacheRead + totalCacheCreation;
  const cacheEfficiency = cacheDenominator > 0 ? totalCacheRead / cacheDenominator : 0;

  const wasteScores = group.map((s) => scoreSessionWaste(s).overall);
  const wasteRate = wasteScores.reduce((acc, w) => acc + w, 0) / n;

  const costsSorted = group.map((s) => s.estimatedCostUsd).sort((a, b) => a - b);

  return {
    harness,
    sessionCount: n,
    costPerOutputToken,
    cacheEfficiency,
    wasteRate,
    medianCostPerSession: percentile(costsSorted, 50),
    totalCostUsd,
  };
}

function emptyHarnessMetrics(harness: string): HarnessMetrics {
  return {
    harness,
    sessionCount: 0,
    costPerOutputToken: 0,
    cacheEfficiency: 0,
    wasteRate: 0,
    medianCostPerSession: 0,
    totalCostUsd: 0,
  };
}

// ─── Feature matrix ───────────────────────────────────────────────────────────

/**
 * Builds a feature × harness matrix showing what fraction of sessions use each
 * optimisation feature per harness group.
 */
export function buildFeatureMatrix(summaries: readonly SessionUsageSummary[]): FeatureMatrix {
  const byHarness = new Map<string, SessionUsageSummary[]>();
  for (const s of summaries) {
    const key = harnessLabel(s.model);
    let group = byHarness.get(key);
    if (!group) {
      group = [];
      byHarness.set(key, group);
    }
    group.push(s);
  }

  const harnesses = [...byHarness.keys()].sort();

  const rows: FeatureMatrixRow[] = FEATURE_KEYS.map(({ key, label }) => {
    const byHarnessCell: Record<string, FeatureMatrixCell> = {};
    for (const [harness, group] of byHarness) {
      const count = group.filter((s) => s.optimizationState?.[key] === true).length;
      byHarnessCell[harness] = {
        usageRate: group.length > 0 ? count / group.length : 0,
        sessionCount: count,
      };
    }
    return { feature: label, byHarness: byHarnessCell };
  });

  return { harnesses, rows };
}

// ─── A/B session diff ─────────────────────────────────────────────────────────

/**
 * Computes a side-by-side diff between two sessions. `b` is "after", `a` is
 * "before"; delta fields are b − a so positive means b is larger/worse/better
 * depending on the metric.
 */
export function diffSessions(a: SessionUsageSummary, b: SessionUsageSummary): ABSessionDiff {
  const snap = (s: SessionUsageSummary): SessionSnapshot => {
    const total = s.usage.inputTokens + s.usage.outputTokens;
    const cacheDenom = s.usage.cacheReadInputTokens + s.usage.cacheCreationInputTokens;
    const cacheHitRate = cacheDenom > 0 ? s.usage.cacheReadInputTokens / cacheDenom : 0;
    const turns = s.userMessageCount + s.assistantMessageCount;
    const wasteScore = scoreSessionWaste(s).overall;
    return {
      sessionId: s.sessionId,
      model: s.model,
      totalTokens: total,
      estimatedCostUsd: s.estimatedCostUsd,
      cacheHitRate,
      turns,
      wasteScore,
      cwd: s.cwd,
      startTime: s.startTime,
    };
  };

  const snapA = snap(a);
  const snapB = snap(b);

  return {
    a: snapA,
    b: snapB,
    delta: {
      tokens: snapB.totalTokens - snapA.totalTokens,
      cost: snapB.estimatedCostUsd - snapA.estimatedCostUsd,
      cacheHitRate: snapB.cacheHitRate - snapA.cacheHitRate,
      turns: snapB.turns - snapA.turns,
      wasteScore: snapB.wasteScore - snapA.wasteScore,
    },
  };
}

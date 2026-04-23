import type {
  SessionUsageSummary,
  SessionWasteSignals,
  WasteScores,
  WasteVerdict,
} from "@control-plane/core";

// ─── Scoring thresholds ──────────────────────────────────────────────────────
// Each constant documents a single saturating linear map `x -> [0, 1]`.
// Healthy sessions score near 0 on every dimension; pathological sessions score
// near 1. The thresholds are deliberately conservative so "normal" sessions
// don't emit flags.

/** cacheCreation/(cacheCreation+cacheRead); healthy is <0.2, starts counting >0.25, saturates at 0.6. */
const CACHE_THRASH_LO = 0.25;
const CACHE_THRASH_HI = 0.6;

/** distinctToolCount; >12 distinct tools starts counting, saturates at 30 (+MCP-weighted boost). */
const TOOL_POLLUTION_LO = 12;
const TOOL_POLLUTION_HI = 30;

/** sequentialToolTurnPct; <0.5 is fine, 0.85+ is severe single-tool hammering. */
const SEQUENTIAL_TOOLS_LO = 0.5;
const SEQUENTIAL_TOOLS_HI = 0.85;

/** toolFailurePct; >5% starts counting, saturates at 30% failure rate. */
const TOOL_FAILURE_LO = 0.05;
const TOOL_FAILURE_HI = 0.3;

/** Top repeat-read count; 4+ reads of the same file starts counting, saturates at 15. */
const REPEAT_READ_LO = 3;
const REPEAT_READ_HI = 15;

/** peakInputTokensBetweenCompactions; 80k starts, saturates at 300k. */
const CONTEXT_BLOAT_LO = 80_000;
const CONTEXT_BLOAT_HI = 300_000;

/** Overall weight mix. Sums to 1.0. */
const WEIGHTS = {
  cacheThrash: 0.25,
  sequentialTools: 0.2,
  toolHammering: 0.2,
  contextBloat: 0.15,
  toolPollution: 0.1,
  compactionAbsence: 0.1,
} as const;

/** Emit a flag for any sub-score above this threshold. */
const FLAG_THRESHOLD = 0.3;

/** Clamped linear interpolation: x in [lo, hi] → [0, 1]. */
function saturate(x: number, lo: number, hi: number): number {
  if (hi <= lo) return x >= hi ? 1 : 0;
  const t = (x - lo) / (hi - lo);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function clamp01(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

const ZERO_SCORES: WasteScores = {
  cacheThrash: 0,
  toolPollution: 0,
  sequentialTools: 0,
  toolHammering: 0,
  contextBloat: 0,
  compactionAbsence: 0,
};

/**
 * Pure, deterministic scorer. Given a `SessionUsageSummary` with populated
 * `.waste` signals, returns normalized 0..1 sub-scores, a weighted overall
 * score, and human-readable flags quoting the offending evidence.
 *
 * If `summary.waste` is undefined, returns an all-zero verdict with a single
 * "waste signals unavailable" flag so downstream consumers can render a
 * consistent row instead of skipping the session silently.
 */
export function scoreSessionWaste(summary: SessionUsageSummary): WasteVerdict {
  const w = summary.waste;
  if (!w) {
    return {
      sessionId: summary.sessionId,
      scores: ZERO_SCORES,
      overall: 0,
      flags: ["waste signals unavailable"],
    };
  }

  const scores = computeScores(w);
  const overall = clamp01(
    scores.cacheThrash * WEIGHTS.cacheThrash +
      scores.sequentialTools * WEIGHTS.sequentialTools +
      scores.toolHammering * WEIGHTS.toolHammering +
      scores.contextBloat * WEIGHTS.contextBloat +
      scores.toolPollution * WEIGHTS.toolPollution +
      scores.compactionAbsence * WEIGHTS.compactionAbsence
  );

  const flags = buildFlags(w, scores);

  return {
    sessionId: summary.sessionId,
    scores,
    overall,
    flags,
  };
}

/**
 * Batch version of `scoreSessionWaste`. Maps every summary — including those
 * without `.waste` — so the caller gets a 1:1 verdict list without filtering.
 */
export function scoreSessionsWaste(
  summaries: readonly SessionUsageSummary[]
): readonly WasteVerdict[] {
  return summaries.map(scoreSessionWaste);
}

function computeScores(w: SessionWasteSignals): WasteScores {
  const cacheThrash = saturate(w.cacheThrashRatio, CACHE_THRASH_LO, CACHE_THRASH_HI);

  // Tool pollution: distinct-tool term, amplified by MCP mix (up to 2x).
  const pollutionBase = saturate(w.distinctToolCount, TOOL_POLLUTION_LO, TOOL_POLLUTION_HI);
  const toolPollution = clamp01(pollutionBase * (1 + w.mcpToolCallPct));

  const sequentialTools = saturate(
    w.sequentialToolTurnPct,
    SEQUENTIAL_TOOLS_LO,
    SEQUENTIAL_TOOLS_HI
  );

  const failureTerm = saturate(w.toolFailurePct, TOOL_FAILURE_LO, TOOL_FAILURE_HI);
  const maxRepeatReadCount = w.repeatReads[0]?.count ?? 0;
  const repeatTerm = saturate(maxRepeatReadCount, REPEAT_READ_LO, REPEAT_READ_HI);
  const toolHammering = Math.max(failureTerm, repeatTerm);

  const contextBloat = saturate(
    w.peakInputTokensBetweenCompactions,
    CONTEXT_BLOAT_LO,
    CONTEXT_BLOAT_HI
  );

  const compactionAbsence = w.bloatWithoutCompaction ? 1 : 0;

  return {
    cacheThrash,
    toolPollution,
    sequentialTools,
    toolHammering,
    contextBloat,
    compactionAbsence,
  };
}

function buildFlags(w: SessionWasteSignals, s: WasteScores): readonly string[] {
  const flags: string[] = [];
  const f1 = cacheThrashFlag(w, s);
  if (f1) flags.push(f1);
  const f2 = toolPollutionFlag(w, s);
  if (f2) flags.push(f2);
  const f3 = sequentialToolsFlag(w, s);
  if (f3) flags.push(f3);
  const f4 = toolHammeringFlag(w, s);
  if (f4) flags.push(f4);
  const f5 = contextOrCompactionFlag(w, s);
  if (f5) flags.push(f5);
  return flags;
}

function cacheThrashFlag(w: SessionWasteSignals, s: WasteScores): string | null {
  if (s.cacheThrash <= FLAG_THRESHOLD) return null;
  const pct = (w.cacheThrashRatio * 100).toFixed(1);
  return `Cache thrash: ${pct}% (ratio ${w.cacheThrashRatio.toFixed(3)})`;
}

function toolPollutionFlag(w: SessionWasteSignals, s: WasteScores): string | null {
  if (s.toolPollution <= FLAG_THRESHOLD) return null;
  const mcpPct = Math.round(w.mcpToolCallPct * 100);
  return `Tool pollution: ${w.distinctToolCount} distinct tools, ${mcpPct}% MCP`;
}

function sequentialToolsFlag(w: SessionWasteSignals, s: WasteScores): string | null {
  if (s.sequentialTools <= FLAG_THRESHOLD) return null;
  const pct = (w.sequentialToolTurnPct * 100).toFixed(1);
  const useBlocks = w.totalToolUseBlocks;
  const singleTurnApprox = Math.round(w.sequentialToolTurnPct * useBlocks);
  return `Single-tool turns: ${pct}% (${singleTurnApprox} / ${useBlocks})`;
}

function toolHammeringFlag(w: SessionWasteSignals, s: WasteScores): string | null {
  if (s.toolHammering <= FLAG_THRESHOLD) return null;
  const top = w.repeatReads[0];
  const failureTerm = saturate(w.toolFailurePct, TOOL_FAILURE_LO, TOOL_FAILURE_HI);
  const repeatTerm = saturate(top?.count ?? 0, REPEAT_READ_LO, REPEAT_READ_HI);
  if (repeatTerm >= failureTerm && top) {
    return `Repeat reads: Read(${top.filePath}) ×${top.count}`;
  }
  const pct = (w.toolFailurePct * 100).toFixed(1);
  return `Tool failure rate: ${pct}%`;
}

function contextOrCompactionFlag(w: SessionWasteSignals, s: WasteScores): string | null {
  const peakK = Math.round(w.peakInputTokensBetweenCompactions / 1000);
  if (s.contextBloat > FLAG_THRESHOLD) {
    if (w.bloatWithoutCompaction) {
      return `Long session without /compact: ${peakK}k peak input`;
    }
    return `Context bloat: ${peakK}k peak input between compactions`;
  }
  if (s.compactionAbsence > FLAG_THRESHOLD) {
    // compactionAbsence stands alone when the bloat score didn't cross the
    // threshold but the binary signal still fired (e.g. just under 80k peak).
    return `Long session without /compact: ${peakK}k peak input`;
  }
  return null;
}

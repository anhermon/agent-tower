/**
 * `cp compare` — cross-harness analytics + model comparison.
 *
 * Subcommands:
 *   cp compare models     — model performance leaderboard
 *   cp compare harnesses  — harness efficiency leaderboard
 *   cp compare features   — feature × harness compatibility matrix
 *   cp compare sessions <idA> <idB> — A/B diff between two sessions
 */
import {
  buildFeatureMatrix,
  ClaudeCodeAnalyticsSource,
  compareByHarness,
  compareByModel,
  diffSessions,
} from "@control-plane/adapter-claude-code";

import { resolveOrExplain } from "../data-root.js";
import { parseFlags } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runCompare(
  sub: string | undefined,
  argv: readonly string[]
): Promise<number> {
  switch (sub) {
    case "models":
      return runCompareModels(argv);
    case "harnesses":
      return runCompareHarnesses(argv);
    case "features":
      return runCompareFeatures(argv);
    case "sessions":
      return runCompareSessions(argv);
    default:
      return runCompareModels(argv);
  }
}

// ─── cp compare models ────────────────────────────────────────────────────────

async function runCompareModels(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{ json?: boolean; pretty?: boolean; limit?: string }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    limit: { type: "string" },
  });
  const mode = resolveOutputMode(values);
  const limit = Math.max(1, Number(values.limit ?? "20") || 20);

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const summaries = await source.listSessionSummaries();
  const models = compareByModel(summaries).slice(0, limit);

  if (mode.json) {
    writeJson({ ok: true, models });
    return 0;
  }

  writeLine(bold(`Model performance leaderboard (${models.length} models)`));
  writeLine("");
  if (models.length === 0) {
    writeLine("No sessions found.");
    return 0;
  }
  const rows = models.map((m) => [
    m.model,
    String(m.sessionCount),
    m.costPerSession.toFixed(4),
    pct(m.cacheHitRate),
    Math.round(m.medianTokensPerTurn).toString(),
    Math.round(m.p95TokensPerTurn).toString(),
    m.avgWasteScore.toFixed(3),
  ]);
  writeLine(
    renderTable(
      [
        "model",
        "sessions",
        "cost/session",
        "cache_hit%",
        "median_tok/turn",
        "p95_tok/turn",
        "avg_waste",
      ],
      rows
    )
  );
  return 0;
}

// ─── cp compare harnesses ─────────────────────────────────────────────────────

async function runCompareHarnesses(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{ json?: boolean; pretty?: boolean; limit?: string }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    limit: { type: "string" },
  });
  const mode = resolveOutputMode(values);
  const limit = Math.max(1, Number(values.limit ?? "20") || 20);

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const summaries = await source.listSessionSummaries();
  const harnesses = compareByHarness(summaries).slice(0, limit);

  if (mode.json) {
    writeJson({ ok: true, harnesses });
    return 0;
  }

  writeLine(bold(`Harness efficiency leaderboard (${harnesses.length} harnesses)`));
  writeLine("");
  if (harnesses.length === 0) {
    writeLine("No sessions found.");
    return 0;
  }
  const rows = harnesses.map((h) => [
    h.harness,
    String(h.sessionCount),
    h.totalCostUsd.toFixed(4),
    h.medianCostPerSession.toFixed(4),
    pct(h.cacheEfficiency),
    h.wasteRate.toFixed(3),
    (h.costPerOutputToken * 1_000_000).toFixed(2),
  ]);
  writeLine(
    renderTable(
      ["harness", "sessions", "total_cost", "median_cost", "cache_eff%", "waste", "µ$/out_tok"],
      rows
    )
  );
  return 0;
}

// ─── cp compare features ──────────────────────────────────────────────────────

async function runCompareFeatures(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{ json?: boolean; pretty?: boolean }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });
  const mode = resolveOutputMode(values);

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const summaries = await source.listSessionSummaries();
  const matrix = buildFeatureMatrix(summaries);

  if (mode.json) {
    writeJson({ ok: true, matrix });
    return 0;
  }

  writeLine(bold("Feature × harness compatibility matrix"));
  writeLine("");
  if (matrix.harnesses.length === 0) {
    writeLine("No sessions found.");
    return 0;
  }

  const headers = ["feature", ...matrix.harnesses];
  const rows = matrix.rows.map((row) => {
    const cells = matrix.harnesses.map((h) => {
      const cell = row.byHarness[h];
      return cell ? pct(cell.usageRate) : "-";
    });
    return [row.feature, ...cells];
  });
  writeLine(renderTable(headers, rows));
  return 0;
}

// ─── cp compare sessions <idA> <idB> ─────────────────────────────────────────

async function runCompareSessions(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseFlags<{ json?: boolean; pretty?: boolean }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });
  const mode = resolveOutputMode(values);

  const [idA, idB] = positionals;
  if (!idA || !idB) {
    writeJson({ ok: false, reason: "usage", message: "Usage: cp compare sessions <idA> <idB>" });
    return 2;
  }

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const [summaryA, summaryB] = await Promise.all([
    source.loadSessionUsage(idA),
    source.loadSessionUsage(idB),
  ]);

  if (!summaryA) {
    writeJson({ ok: false, reason: "not_found", message: `Session not found: ${idA}` });
    return 1;
  }
  if (!summaryB) {
    writeJson({ ok: false, reason: "not_found", message: `Session not found: ${idB}` });
    return 1;
  }

  const diff = diffSessions(summaryA, summaryB);

  if (mode.json) {
    writeJson({ ok: true, diff });
    return 0;
  }

  writeLine(bold("A/B session comparison"));
  writeLine("");
  writeLine(
    renderTable(
      ["metric", "session A", "session B", "delta (B−A)"],
      [
        ["id", diff.a.sessionId.slice(0, 20), diff.b.sessionId.slice(0, 20), ""],
        ["model", diff.a.model ?? "-", diff.b.model ?? "-", ""],
        [
          "tokens",
          String(diff.a.totalTokens),
          String(diff.b.totalTokens),
          signed(diff.delta.tokens),
        ],
        [
          "cost_usd",
          diff.a.estimatedCostUsd.toFixed(4),
          diff.b.estimatedCostUsd.toFixed(4),
          signed4(diff.delta.cost),
        ],
        [
          "cache_hit%",
          pct(diff.a.cacheHitRate),
          pct(diff.b.cacheHitRate),
          signedPct(diff.delta.cacheHitRate),
        ],
        ["turns", String(diff.a.turns), String(diff.b.turns), signed(diff.delta.turns)],
        [
          "waste",
          diff.a.wasteScore.toFixed(3),
          diff.b.wasteScore.toFixed(3),
          signed4(diff.delta.wasteScore),
        ],
      ]
    )
  );
  return 0;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

function signed4(n: number): string {
  return n >= 0 ? `+${n.toFixed(4)}` : n.toFixed(4);
}

function signedPct(n: number): string {
  const pctStr = (n * 100).toFixed(1);
  return n >= 0 ? `+${pctStr}%` : `${pctStr}%`;
}

import { ClaudeCodeAnalyticsSource, scoreSessionsWaste } from "@control-plane/adapter-claude-code";
import type { SessionUsageSummary, WasteVerdict } from "@control-plane/core";

import { resolveOrExplain } from "../data-root.js";
import { parseFlags, readDateFlag, readIntFlag, UsageError } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

/**
 * Lists sessions ranked by overall waste score. Mirrors `sessions top`'s
 * filter shape (project, since, until, limit) plus a `--min-score` threshold
 * so operators can hide "clean" sessions without post-filtering the JSON.
 */
export async function runSessionsWaste(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    limit?: string;
    "min-score"?: string;
    project?: string;
    since?: string;
    until?: string;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    limit: { type: "string" },
    "min-score": { type: "string" },
    project: { type: "string" },
    since: { type: "string" },
    until: { type: "string" },
  });

  const mode = resolveOutputMode(values);
  const limit = readIntFlag(values.limit, 10, "limit");
  const minScore = readFloatFlag(values["min-score"], 0.3, "min-score");
  const since = readDateFlag(values.since, "since");
  const until = readDateFlag(values.until, "until");

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const filter =
    since && until
      ? {
          range: { from: since, to: until },
          ...(values.project ? { projectId: values.project } : {}),
        }
      : values.project
        ? { projectId: values.project }
        : undefined;

  const summaries = await source.listSessionSummaries(filter);
  const verdicts = scoreSessionsWaste(summaries);
  const byId = new Map(summaries.map((s) => [s.sessionId, s] as const));

  const filtered = verdicts
    .filter((v) => v.overall >= minScore)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, Math.max(1, limit));

  if (mode.json) {
    writeJson({
      ok: true,
      results: filtered,
      meta: { total: verdicts.length, minScore },
    });
    return 0;
  }

  writeLine(bold(`Sessions by waste score (min ${minScore.toFixed(2)})`));
  writeLine("");
  if (filtered.length === 0) {
    writeLine("No sessions matched the filter.");
    return 0;
  }
  const rows = filtered.map((v) => {
    const summary = byId.get(v.sessionId);
    return [
      v.overall.toFixed(3),
      v.sessionId,
      summary ? `$${summary.estimatedCostUsd.toFixed(4)}` : "-",
      summary ? String(summary.userMessageCount + summary.assistantMessageCount) : "-",
      v.flags[0] ?? "-",
    ];
  });
  writeLine(renderTable(["score", "session", "cost", "turns", "top flag"], rows));
  return 0;
}

function readFloatFlag(value: string | undefined, fallback: number, flagName: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new UsageError(`--${flagName} must be a number in [0, 1], got "${value}"`);
  }
  return parsed;
}

export type { SessionUsageSummary, WasteVerdict };

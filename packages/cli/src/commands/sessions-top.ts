import { ClaudeCodeAnalyticsSource } from "@control-plane/adapter-claude-code";
import type { SessionUsageSummary } from "@control-plane/core";
import { resolveOrExplain } from "../data-root.js";
import { parseFlags, readDateFlag, readEnumFlag, readIntFlag } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

type SortBy = "tokens" | "cost" | "turns";
const SORT_BY: readonly SortBy[] = ["tokens", "cost", "turns"];

export async function runSessionsTop(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    by?: string;
    limit?: string;
    project?: string;
    since?: string;
    until?: string;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    by: { type: "string" },
    limit: { type: "string" },
    project: { type: "string" },
    since: { type: "string" },
    until: { type: "string" },
  });

  const mode = resolveOutputMode(values);
  const sortBy = readEnumFlag<SortBy>(values.by, SORT_BY, "tokens", "by");
  const limit = readIntFlag(values.limit, 10, "limit");
  const since = readDateFlag(values.since, "since");
  const until = readDateFlag(values.until, "until");

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 0;

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  // `listSessionSummaries` accepts a filter; we only build the range when both
  // ends are supplied — partial ranges would silently drop every session.
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
  const sorted = [...summaries].sort((a, b) => compareSummaries(a, b, sortBy));
  const sliced = sorted.slice(0, limit);

  if (mode.json) {
    writeJson({
      ok: true,
      sessions: sliced.map((s) => projectSession(s)),
    });
    return 0;
  }

  writeLine(bold(`Top ${sliced.length} sessions by ${sortBy}`));
  writeLine("");
  if (sliced.length === 0) {
    writeLine("No sessions matched the filter.");
    return 0;
  }
  const rows = sliced.map((s) => [
    s.sessionId,
    s.model ?? "-",
    String(totalTokens(s)),
    s.estimatedCostUsd.toFixed(4),
    String(turnCount(s)),
    s.startTime ?? "-",
  ]);
  writeLine(renderTable(["session", "model", "tokens", "cost_usd", "turns", "started_at"], rows));
  return 0;
}

function turnCount(summary: SessionUsageSummary): number {
  return summary.userMessageCount + summary.assistantMessageCount;
}

function totalTokens(summary: SessionUsageSummary): number {
  return summary.usage.inputTokens + summary.usage.outputTokens;
}

function compareSummaries(a: SessionUsageSummary, b: SessionUsageSummary, by: SortBy): number {
  switch (by) {
    case "cost":
      return b.estimatedCostUsd - a.estimatedCostUsd;
    case "turns":
      return turnCount(b) - turnCount(a);
    default:
      return totalTokens(b) - totalTokens(a);
  }
}

interface ProjectedSession {
  readonly sessionId: string;
  readonly totalTokens: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly estimatedCostUsd: number;
  readonly turnCount: number;
  readonly model: string | null;
  readonly cwd: string | null;
  readonly startTime: string | null;
}

function projectSession(summary: SessionUsageSummary): ProjectedSession {
  return {
    sessionId: summary.sessionId,
    totalTokens: totalTokens(summary),
    inputTokens: summary.usage.inputTokens,
    outputTokens: summary.usage.outputTokens,
    cacheReadInputTokens: summary.usage.cacheReadInputTokens,
    cacheCreationInputTokens: summary.usage.cacheCreationInputTokens,
    estimatedCostUsd: summary.estimatedCostUsd,
    turnCount: turnCount(summary),
    model: summary.model,
    cwd: summary.cwd ?? null,
    startTime: summary.startTime ?? null,
  };
}

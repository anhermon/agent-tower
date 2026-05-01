import { buildAdapterRegistry } from "@control-plane/adapter-claude-code";
import type { SessionUsageSummary } from "@control-plane/core";

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
    harness?: string;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    by: { type: "string" },
    limit: { type: "string" },
    project: { type: "string" },
    since: { type: "string" },
    until: { type: "string" },
    harness: { type: "string" },
  });

  const mode = resolveOutputMode(values);
  const sortBy = readEnumFlag<SortBy>(values.by, SORT_BY, "tokens", "by");
  const limit = readIntFlag(values.limit, 10, "limit");
  const since = readDateFlag(values.since, "since");
  const until = readDateFlag(values.until, "until");
  const harnessFilter = typeof values.harness === "string" ? values.harness : undefined;

  // Build a registry with all auto-discovered harnesses. Unlike the old
  // single-adapter path, this returns sessions from every harness that has
  // a resolvable data root (Claude Code + Codex by default).
  const registry = buildAdapterRegistry();

  if (registry.isEmpty) {
    if (mode.json) {
      writeJson({ ok: false, reason: "unconfigured" });
    } else {
      writeLine(
        "No harness data roots configured. Set CLAUDE_CONTROL_PLANE_DATA_ROOT or " +
          "ensure ~/.claude/projects exists."
      );
    }
    return 1;
  }

  const filter =
    since && until
      ? {
          range: { from: since, to: until },
          ...(values.project ? { projectId: values.project } : {}),
        }
      : values.project
        ? { projectId: values.project }
        : undefined;

  let summaries = await registry.listAllSessionSummaries(filter);

  // Apply harness filter post-merge so registry.listAllSessionSummaries()
  // can still benefit from parallel execution across adapters.
  if (harnessFilter) {
    summaries = summaries.filter((s) => s.harness === harnessFilter);
  }

  const sorted = [...summaries].sort((a, b) => compareSummaries(a, b, sortBy));
  const effectiveLimit = Math.max(1, limit);
  const sliced = sorted.slice(0, effectiveLimit);

  if (mode.json) {
    writeJson({
      ok: true,
      ...(harnessFilter ? { harness: harnessFilter } : {}),
      sessions: sliced.map((s) => projectSession(s)),
    });
    return 0;
  }

  const headline = harnessFilter
    ? `Top ${sliced.length} sessions by ${sortBy} (harness: ${harnessFilter})`
    : `Top ${sliced.length} sessions by ${sortBy}`;
  writeLine(bold(headline));
  writeLine("");
  if (sliced.length === 0) {
    writeLine("No sessions matched the filter.");
    return 0;
  }
  const rows = sliced.map((s) => [
    s.sessionId,
    s.harness ?? "-",
    s.model ?? "-",
    String(totalTokens(s)),
    s.estimatedCostUsd.toFixed(4),
    String(turnCount(s)),
    s.startTime ?? "-",
  ]);
  writeLine(
    renderTable(["session", "harness", "model", "tokens", "cost_usd", "turns", "started_at"], rows)
  );
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
  readonly harness: string | null;
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
    harness: summary.harness ?? null,
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

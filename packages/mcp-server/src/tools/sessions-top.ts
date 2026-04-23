import { ClaudeCodeAnalyticsSource, resolveDataRoot } from "@control-plane/adapter-claude-code";
import type { DateRange, SessionAnalyticsFilter, SessionUsageSummary } from "@control-plane/core";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

export type SessionsTopBy = "tokens" | "cost" | "turns";

interface ParsedSessionsTopInput {
  readonly by: SessionsTopBy | null;
  readonly limit: number | null;
  readonly projectId: string | null;
  readonly since: string | null;
  readonly until: string | null;
}

const DEFAULT_BY: SessionsTopBy = "tokens";
const DEFAULT_LIMIT = 10;

function parseBy(val: unknown): SessionsTopBy | null {
  return val === "cost" || val === "turns" || val === "tokens" ? val : null;
}

function parseFiniteNumber(val: unknown): number | null {
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function parseNonEmptyString(val: unknown): string | null {
  return typeof val === "string" && val.length > 0 ? val : null;
}

function parseInput(raw: unknown): ParsedSessionsTopInput {
  const r = asRecord(raw);
  return {
    by: parseBy(r.by),
    limit: parseFiniteNumber(r.limit),
    projectId: parseNonEmptyString(r.projectId),
    since: parseNonEmptyString(r.since),
    until: parseNonEmptyString(r.until),
  };
}

function rank(summary: SessionUsageSummary, by: SessionsTopBy): number {
  if (by === "cost") return summary.estimatedCostUsd;
  if (by === "turns") {
    return summary.userMessageCount + summary.assistantMessageCount;
  }
  const usage = summary.usage;
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheReadInputTokens +
    usage.cacheCreationInputTokens
  );
}

export const sessionsTopTool: ToolDefinition = {
  name: "sessions_top",
  description:
    "Read-only. Returns the top sessions by tokens, cost, or turn count. Filters by optional project id and an inclusive YYYY-MM-DD date range via since/until (either bound alone resolves to a single-day window).",
  inputSchema: {
    type: "object",
    properties: {
      by: {
        type: "string",
        enum: ["tokens", "cost", "turns"],
        description: "Ranking metric. Defaults to tokens.",
      },
      limit: {
        type: "number",
        minimum: 1,
        description: "Maximum number of sessions to return. Defaults to 10.",
      },
      projectId: {
        type: "string",
        description: "Restrict results to a single project id (matches SessionUsageSummary.cwd).",
      },
      since: {
        type: "string",
        description: "Inclusive lower bound for the session start date. Format YYYY-MM-DD.",
      },
      until: {
        type: "string",
        description: "Inclusive upper bound for the session start date. Format YYYY-MM-DD.",
      },
    },
    additionalProperties: false,
  },
  handler: async (raw): Promise<ToolResult> => {
    try {
      return await runSessionsTopHandler(raw);
    } catch (error) {
      return errorResult(error);
    }
  },
};

async function runSessionsTopHandler(raw: unknown): Promise<ToolResult> {
  const input = parseInput(raw);
  const resolved = resolveDataRoot();
  if (!resolved) {
    return { ok: false, reason: "unconfigured" };
  }
  const by = input.by ?? DEFAULT_BY;
  const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));
  const range = buildDateRange(input.since, input.until);

  const filter: SessionAnalyticsFilter = {
    ...(range ? { range } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  };

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const summaries = await source.listSessionSummaries(filter);
  const sorted = [...summaries].sort((a, b) => rank(b, by) - rank(a, by));
  const sliced = sorted.slice(0, limit);

  return {
    ok: true,
    by,
    limit,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.since ? { since: input.since } : {}),
    ...(input.until ? { until: input.until } : {}),
    total: summaries.length,
    sessions: sliced,
  };
}

function buildDateRange(since: string | null, until: string | null): DateRange | null {
  if (since && until) return { from: since, to: until };
  if (since) return { from: since, to: since };
  if (until) return { from: until, to: until };
  return null;
}

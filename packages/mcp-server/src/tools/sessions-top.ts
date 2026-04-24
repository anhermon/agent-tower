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

function parseTopBy(raw: unknown): SessionsTopBy | null {
  return raw === "cost" || raw === "turns" || raw === "tokens" ? raw : null;
}

function parseInput(raw: unknown): ParsedSessionsTopInput {
  const r = asRecord(raw);
  return {
    by: parseTopBy(r.by),
    limit: typeof r.limit === "number" && Number.isFinite(r.limit) ? r.limit : null,
    projectId: typeof r.projectId === "string" && r.projectId.length > 0 ? r.projectId : null,
    since: typeof r.since === "string" && r.since.length > 0 ? r.since : null,
    until: typeof r.until === "string" && r.until.length > 0 ? r.until : null,
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

function resolveDateRange(since: string | null, until: string | null): DateRange | null {
  if (since && until) return { from: since, to: until };
  if (since) return { from: since, to: since };
  if (until) return { from: until, to: until };
  return null;
}

async function fetchSessions(
  directory: string,
  input: ParsedSessionsTopInput
): Promise<readonly SessionUsageSummary[]> {
  const source = new ClaudeCodeAnalyticsSource({ directory });
  const range = resolveDateRange(input.since, input.until);
  const filter: SessionAnalyticsFilter = {
    ...(range ? { range } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  };
  return source.listSessionSummaries(filter);
}

function buildTopResult(
  input: ParsedSessionsTopInput,
  summaries: readonly SessionUsageSummary[],
  by: SessionsTopBy,
  limit: number
): ToolResult {
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
      const input = parseInput(raw);
      const resolved = resolveDataRoot();
      if (!resolved) {
        return { ok: false, reason: "unconfigured" };
      }
      const by = input.by ?? DEFAULT_BY;
      const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));
      const summaries = await fetchSessions(resolved.directory, input);
      return buildTopResult(input, summaries, by, limit);
    } catch (error) {
      return errorResult(error);
    }
  },
};

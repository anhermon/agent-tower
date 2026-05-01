import { buildAdapterRegistry } from "@control-plane/adapter-claude-code";
import type { DateRange, SessionAnalyticsFilter, SessionUsageSummary } from "@control-plane/core";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

export type SessionsTopBy = "tokens" | "cost" | "turns";

interface ParsedSessionsTopInput {
  readonly by: SessionsTopBy | null;
  readonly limit: number | null;
  readonly projectId: string | null;
  readonly since: string | null;
  readonly until: string | null;
  readonly harness: string | null;
}

const DEFAULT_BY: SessionsTopBy = "tokens";
const DEFAULT_LIMIT = 10;

function parseInput(raw: unknown): ParsedSessionsTopInput {
  const r = asRecord(raw);
  const by = r.by;
  const limit = r.limit;
  const projectId = r.projectId;
  const since = r.since;
  const until = r.until;
  const harness = r.harness;
  return {
    by: by === "cost" || by === "turns" || by === "tokens" ? by : null,
    limit: typeof limit === "number" && Number.isFinite(limit) ? limit : null,
    projectId: typeof projectId === "string" && projectId.length > 0 ? projectId : null,
    since: typeof since === "string" && since.length > 0 ? since : null,
    until: typeof until === "string" && until.length > 0 ? until : null,
    harness: typeof harness === "string" && harness.length > 0 ? harness : null,
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
    "Read-only. Returns the top sessions by tokens, cost, or turn count across all registered harnesses (Claude Code, Codex, etc.). Filters by optional harness kind, project id, and an inclusive YYYY-MM-DD date range via since/until.",
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
      harness: {
        type: "string",
        description:
          'Filter by harness kind. Known values: "claude-code", "codex". Omit to include all harnesses.',
      },
    },
    additionalProperties: false,
  },
  handler: async (raw): Promise<ToolResult> => {
    try {
      const input = parseInput(raw);
      const by = input.by ?? DEFAULT_BY;
      const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));

      const registry = buildAdapterRegistry();
      if (registry.isEmpty) {
        return { ok: false, reason: "unconfigured" };
      }

      let range: DateRange | null = null;
      if (input.since && input.until) {
        range = { from: input.since, to: input.until };
      } else if (input.since) {
        range = { from: input.since, to: input.since };
      } else if (input.until) {
        range = { from: input.until, to: input.until };
      }

      const filter: SessionAnalyticsFilter = {
        ...(range ? { range } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      };

      let summaries = await registry.listAllSessionSummaries(filter);

      if (input.harness) {
        summaries = summaries.filter((s) => s.harness === input.harness);
      }

      const sorted = [...summaries].sort((a, b) => rank(b, by) - rank(a, by));
      const sliced = sorted.slice(0, limit);

      return {
        ok: true,
        by,
        limit,
        ...(input.harness ? { harness: input.harness } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.since ? { since: input.since } : {}),
        ...(input.until ? { until: input.until } : {}),
        total: summaries.length,
        sessions: sliced,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

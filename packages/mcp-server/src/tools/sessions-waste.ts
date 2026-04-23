import {
  ClaudeCodeAnalyticsSource,
  resolveDataRoot,
  scoreSessionWaste,
} from "@control-plane/adapter-claude-code";
import type { DateRange, SessionAnalyticsFilter } from "@control-plane/core";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

interface ParsedSessionsWasteInput {
  readonly limit: number | null;
  readonly minScore: number | null;
  readonly project: string | null;
  readonly since: string | null;
  readonly until: string | null;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_MIN_SCORE = 0.3;

function parseInput(raw: unknown): ParsedSessionsWasteInput {
  const r = asRecord(raw);
  const limit = r.limit;
  const minScore = r.minScore;
  const project = r.project;
  const since = r.since;
  const until = r.until;
  return {
    limit: typeof limit === "number" && Number.isFinite(limit) ? limit : null,
    minScore: typeof minScore === "number" && Number.isFinite(minScore) ? minScore : null,
    project: typeof project === "string" && project.length > 0 ? project : null,
    since: typeof since === "string" && since.length > 0 ? since : null,
    until: typeof until === "string" && until.length > 0 ? until : null,
  };
}

export const sessionsWasteTool: ToolDefinition = {
  name: "sessions_waste",
  description:
    "Read-only. Ranks sessions by overall waste score (cache thrash, sequential tools, tool pollution, context bloat, etc.). Filters by optional project id and ISO-8601 date range; returns verdicts above minScore sorted desc.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        minimum: 1,
        maximum: MAX_LIMIT,
        description: `Maximum number of sessions to return. Defaults to ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`,
      },
      minScore: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: `Minimum overall waste score (0..1). Defaults to ${DEFAULT_MIN_SCORE}.`,
      },
      project: {
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

      const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)));
      const minScore = input.minScore ?? DEFAULT_MIN_SCORE;

      const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });

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
        ...(input.project ? { projectId: input.project } : {}),
      };

      const summaries = await source.listSessionSummaries(filter);
      const verdicts = summaries
        .map((summary) => scoreSessionWaste(summary))
        .filter((verdict) => verdict.overall >= minScore)
        .sort((a, b) => b.overall - a.overall)
        .slice(0, limit);

      return {
        ok: true,
        limit,
        minScore,
        ...(input.project ? { project: input.project } : {}),
        ...(input.since ? { since: input.since } : {}),
        ...(input.until ? { until: input.until } : {}),
        total: summaries.length,
        results: verdicts,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

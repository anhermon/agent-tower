import { computeSkillsEfficacy, type SkillEfficacyRow } from "@control-plane/adapter-claude-code";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

interface ParsedSkillsEfficacyInput {
  readonly negativeOnly: boolean;
  readonly minSessions: number | null;
  readonly limit: number | null;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_SESSIONS = 3;

function parseInput(raw: unknown): ParsedSkillsEfficacyInput {
  const r = asRecord(raw);
  const negativeOnly = r.negativeOnly;
  const minSessions = r.minSessions;
  const limit = r.limit;
  return {
    negativeOnly: negativeOnly === true,
    minSessions:
      typeof minSessions === "number" && Number.isFinite(minSessions) ? minSessions : null,
    limit: typeof limit === "number" && Number.isFinite(limit) ? limit : null,
  };
}

export const skillsEfficacyTool: ToolDefinition = {
  name: "skills_efficacy",
  description:
    "Read-only. Ranks qualifying skills by their effective-score delta versus the all-sessions baseline. When negativeOnly=true, returns regressors sorted ascending. Otherwise returns top performers sorted descending.",
  inputSchema: {
    type: "object",
    properties: {
      negativeOnly: {
        type: "boolean",
        description:
          "Only include skills whose delta is below zero, sorted ascending. Defaults to false.",
      },
      minSessions: {
        type: "number",
        minimum: 1,
        description: "Minimum session count for a skill to qualify. Defaults to 3.",
      },
      limit: {
        type: "number",
        minimum: 1,
        description: "Maximum number of rows to return. Defaults to 20.",
      },
    },
    additionalProperties: false,
  },
  handler: async (raw): Promise<ToolResult> => {
    try {
      const input = parseInput(raw);
      const negativeOnly = input.negativeOnly;
      const minSessions = Math.max(1, Math.floor(input.minSessions ?? DEFAULT_MIN_SESSIONS));
      const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));

      const result = await computeSkillsEfficacy({
        minSessionsForQualifying: minSessions,
      });
      if (!result.ok) {
        if (result.reason === "unconfigured") {
          return { ok: false, reason: "unconfigured" };
        }
        return {
          ok: false,
          reason: "error",
          ...(result.message ? { message: result.message } : {}),
        };
      }

      const qualifying = result.report.qualifying;
      let rows: readonly SkillEfficacyRow[];
      if (negativeOnly) {
        rows = [...qualifying].filter((row) => row.delta < 0).sort((a, b) => a.delta - b.delta);
      } else {
        rows = [...qualifying].sort((a, b) => b.delta - a.delta);
      }
      const sliced = rows.slice(0, limit);

      return {
        ok: true,
        negativeOnly,
        minSessions,
        limit,
        baseline: result.report.baseline,
        sessionsAnalyzed: result.report.sessionsAnalyzed,
        sessionsWithSkill: result.report.sessionsWithSkill,
        outcomeDistribution: result.report.outcomeDistribution,
        skills: sliced,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

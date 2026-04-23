import { computeSkillsUsage, type SkillUsageStats } from "@control-plane/adapter-claude-code";
import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

interface ParsedSkillsUsageInput {
  readonly limit: number | null;
}

const DEFAULT_LIMIT = 20;

function parseInput(raw: unknown): ParsedSkillsUsageInput {
  const r = asRecord(raw);
  const limit = r.limit;
  return {
    limit: typeof limit === "number" && Number.isFinite(limit) ? limit : null,
  };
}

type StrippedSkill = Omit<SkillUsageStats, "perHourOfDay" | "perDayOfWeek" | "perDay">;

function stripHeatmaps(row: SkillUsageStats): StrippedSkill {
  const { perHourOfDay: _h, perDayOfWeek: _d, perDay: _p, ...rest } = row;
  void _h;
  void _d;
  void _p;
  return rest;
}

export const skillsUsageTool: ToolDefinition = {
  name: "skills_usage",
  description:
    "Read-only. Returns overall skill-usage totals plus the top-N skills (default 20). Per-entry heatmap arrays are stripped; the report-level heatmap arrays remain.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        minimum: 1,
        description: "Maximum number of skills to include in perSkill. Defaults to 20.",
      },
    },
    additionalProperties: false,
  },
  handler: async (raw): Promise<ToolResult> => {
    try {
      const input = parseInput(raw);
      const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));
      const result = await computeSkillsUsage();
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
      const { totals, perSkill, perHourOfDay, perDayOfWeek, perDay } = result.report;
      const sliced = perSkill.slice(0, limit).map(stripHeatmaps);
      return {
        ok: true,
        limit,
        totals,
        perSkill: sliced,
        perHourOfDay,
        perDayOfWeek,
        perDay,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

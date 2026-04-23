import { computeSkillsUsage, type SkillUsageStats } from "@control-plane/adapter-claude-code";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

export type SkillsTopBy = "invocations" | "size" | "bytes-injected" | "tokens-injected";

interface ParsedSkillsTopInput {
  readonly by: SkillsTopBy | null;
  readonly limit: number | null;
}

const DEFAULT_BY: SkillsTopBy = "invocations";
const DEFAULT_LIMIT = 10;

function parseInput(raw: unknown): ParsedSkillsTopInput {
  const r = asRecord(raw);
  const by = r.by;
  const limit = r.limit;
  const byNormalized: SkillsTopBy | null =
    by === "invocations" || by === "size" || by === "bytes-injected" || by === "tokens-injected"
      ? by
      : null;
  return {
    by: byNormalized,
    limit: typeof limit === "number" && Number.isFinite(limit) ? limit : null,
  };
}

function rank(row: SkillUsageStats, by: SkillsTopBy): number {
  switch (by) {
    case "size":
      return row.sizeBytes;
    case "bytes-injected":
      return row.bytesInjected;
    case "tokens-injected":
      return row.tokensInjected;
    default:
      return row.invocationCount;
  }
}

type StrippedSkill = Omit<SkillUsageStats, "perHourOfDay" | "perDayOfWeek" | "perDay">;

function stripHeatmaps(row: SkillUsageStats): StrippedSkill {
  const { perHourOfDay: _h, perDayOfWeek: _d, perDay: _p, ...rest } = row;
  void _h;
  void _d;
  void _p;
  return rest;
}

export const skillsTopTool: ToolDefinition = {
  name: "skills_top",
  description:
    "Read-only. Returns the top skills ranked by invocation count, manifest size, bytes injected, or tokens injected. Heatmap arrays are stripped from each entry.",
  inputSchema: {
    type: "object",
    properties: {
      by: {
        type: "string",
        enum: ["invocations", "size", "bytes-injected", "tokens-injected"],
        description: "Ranking metric. Defaults to invocations.",
      },
      limit: {
        type: "number",
        minimum: 1,
        description: "Maximum number of skills to return. Defaults to 10.",
      },
    },
    additionalProperties: false,
  },
  handler: async (raw): Promise<ToolResult> => {
    try {
      const input = parseInput(raw);
      const by = input.by ?? DEFAULT_BY;
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
      const sorted = [...result.report.perSkill].sort((a, b) => rank(b, by) - rank(a, by));
      const sliced = sorted.slice(0, limit).map(stripHeatmaps);
      return {
        ok: true,
        by,
        limit,
        total: result.report.perSkill.length,
        skills: sliced,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

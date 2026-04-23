import {
  computeSkillsEfficacy,
  computeSkillsHygiene,
  computeSkillsUsage,
  listSkillsOrEmpty,
} from "@control-plane/adapter-claude-code";

import { errorResult, type ToolDefinition, type ToolResult } from "./types.js";

/**
 * `skills_housekeep` — READ-ONLY hygiene audit over the local skill
 * catalogue. Returns dead-weight (0 invocations), cold-giant (>8KB AND <5
 * invocations), and negative-efficacy (Δ < -0.05 AND n >= 5) buckets plus
 * per-skill verbatim reasons.
 *
 * NOTE: the `--apply` archival step is CLI-only. MCP clients get the dry-run
 * analysis exclusively so agents cannot move skill directories. Point the
 * user at `cp skills housekeep --apply` for the destructive half.
 */

function adaptError(result: { reason: string; message?: string }): ToolResult {
  if (result.reason === "unconfigured") return { ok: false, reason: "unconfigured" };
  return {
    ok: false,
    reason: "error",
    ...(result.message ? { message: result.message } : {}),
  };
}

async function runHygieneAudit(): Promise<ToolResult> {
  const skillsList = await listSkillsOrEmpty();
  if (!skillsList.ok) return adaptError(skillsList);

  const usage = await computeSkillsUsage({ skills: skillsList.skills });
  if (!usage.ok) return adaptError(usage);

  const efficacy = await computeSkillsEfficacy({ skills: skillsList.skills });
  if (!efficacy.ok) return adaptError(efficacy);

  const report = computeSkillsHygiene({
    skills: skillsList.skills,
    usage: usage.report.perSkill,
    efficacy: [...efficacy.report.qualifying, ...efficacy.report.insufficientData],
  });

  return {
    ok: true,
    applied: false,
    deadWeight: report.deadWeight,
    coldGiants: report.coldGiants,
    negativeEfficacy: report.negativeEfficacy,
    totals: report.totals,
  };
}

export const skillsHousekeepTool: ToolDefinition = {
  name: "skills_housekeep",
  description:
    "Read-only. Classifies the local skill catalogue into dead-weight (0 invocations, auto-archivable via CLI), cold giants (>8KB manifest AND 1-4 invocations, human review), and negative-efficacy skills (Δ < -0.05 AND ≥5 qualifying sessions). Returns per-skill reasons verbatim. The --apply archival step is CLI-only.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (): Promise<ToolResult> => {
    try {
      return await runHygieneAudit();
    } catch (error) {
      return errorResult(error);
    }
  },
};

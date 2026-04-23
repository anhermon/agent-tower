import { rename, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  computeSkillsEfficacy,
  computeSkillsHygiene,
  computeSkillsUsage,
  listSkillsOrEmpty,
  type DeadWeightSkill,
} from "@control-plane/adapter-claude-code";

import { parseFlags } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

type HousekeepResult =
  | {
      readonly ok: true;
      readonly applied: boolean;
      readonly deadWeight: readonly DeadWeightSkill[];
      readonly coldGiants: readonly unknown[];
      readonly negativeEfficacy: readonly unknown[];
      readonly totals: {
        readonly skillsOnDisk: number;
        readonly deadWeightCount: number;
        readonly coldGiantCount: number;
        readonly negativeEfficacyCount: number;
        readonly deadWeightBytes: number;
      };
    }
  | { readonly ok: false; readonly reason: string; readonly message?: string };

async function computeHygiene(): Promise<HousekeepResult> {
  const skillsList = await listSkillsOrEmpty();
  if (!skillsList.ok) {
    return {
      ok: false,
      reason: skillsList.reason,
      ...(skillsList.message ? { message: skillsList.message } : {}),
    };
  }

  const usage = await computeSkillsUsage({ skills: skillsList.skills });
  if (!usage.ok) {
    return {
      ok: false,
      reason: usage.reason,
      ...(usage.message ? { message: usage.message } : {}),
    };
  }

  const efficacy = await computeSkillsEfficacy({ skills: skillsList.skills });
  if (!efficacy.ok) {
    return {
      ok: false,
      reason: efficacy.reason,
      ...(efficacy.message ? { message: efficacy.message } : {}),
    };
  }

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

async function applyArchive(deadWeight: readonly DeadWeightSkill[]): Promise<void> {
  const byRoot = new Map<string, DeadWeightSkill[]>();
  for (const skill of deadWeight) {
    const list = byRoot.get(skill.rootDirectory) ?? [];
    list.push(skill);
    byRoot.set(skill.rootDirectory, list);
  }

  const now = new Date();
  const ts =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, "0")}` +
    `${String(now.getDate()).padStart(2, "0")}` +
    `-${String(now.getHours()).padStart(2, "0")}` +
    `${String(now.getMinutes()).padStart(2, "0")}` +
    `${String(now.getSeconds()).padStart(2, "0")}`;

  for (const [root, skills] of byRoot) {
    const archiveDir = path.join(root, ".archive", ts);
    await mkdir(archiveDir, { recursive: true });
    for (const skill of skills) {
      const dest = path.join(archiveDir, path.basename(skill.directory));
      await rename(skill.directory, dest);
    }
  }
}

/**
 * Directly testable tool object (same interface as MCP skills_housekeep).
 * The MCP tool re-implements this logic independently; the CLI exports it here
 * so unit tests can call `.handler({})` without spawning the CLI process.
 */
export const skillsHousekeepTool = {
  name: "skills_housekeep" as const,
  description:
    "Read-only. Classifies the local skill catalogue into dead-weight (0 invocations, auto-archivable via CLI), cold giants (>8KB manifest AND 1-4 invocations, human review), and negative-efficacy skills (Δ < -0.05 AND ≥5 qualifying sessions). Returns per-skill reasons verbatim. The --apply archival step is CLI-only.",
  inputSchema: {
    type: "object" as const,
    properties: {} as Record<string, never>,
    additionalProperties: false as const,
  },
  handler: async (_input: unknown): Promise<HousekeepResult> => {
    try {
      return await computeHygiene();
    } catch (error) {
      return {
        ok: false,
        reason: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

function renderPrettyHousekeep(result: Extract<HousekeepResult, { ok: true }>): void {
  const { deadWeight, coldGiants, negativeEfficacy, totals } = result;

  writeLine(
    bold("Skills housekeep") +
      (result.applied ? " (applied)" : " (dry-run — pass --apply to archive)")
  );
  writeLine("");
  writeLine(
    `Skills on disk: ${totals.skillsOnDisk}  |  Dead weight: ${totals.deadWeightCount}  |  Cold giants: ${totals.coldGiantCount}  |  Negative efficacy: ${totals.negativeEfficacyCount}`
  );
  writeLine("");

  if (deadWeight.length === 0 && coldGiants.length === 0 && negativeEfficacy.length === 0) {
    writeLine("No hygiene issues found.");
    return;
  }

  if (deadWeight.length > 0) {
    writeLine(bold("Dead weight (0 invocations):"));
    writeLine(
      renderTable(
        ["skill", "size", "reason"],
        deadWeight.map((s) => [s.displayName, `${s.sizeBytes}B`, s.reason])
      )
    );
    writeLine("");
  }

  if (coldGiants.length > 0) {
    writeLine(bold("Cold giants (large, rarely used):"));
    const rows = (
      coldGiants as readonly { displayName: string; sizeBytes: number; reason: string }[]
    ).map((s) => [s.displayName, `${s.sizeBytes}B`, s.reason]);
    writeLine(renderTable(["skill", "size", "reason"], rows));
    writeLine("");
  }

  if (negativeEfficacy.length > 0) {
    writeLine(bold("Negative efficacy:"));
    const rows = (
      negativeEfficacy as readonly {
        displayName: string;
        sessionsCount: number;
        delta: number;
        reason: string;
      }[]
    ).map((s) => [s.displayName, String(s.sessionsCount), s.delta.toFixed(3), s.reason]);
    writeLine(renderTable(["skill", "sessions", "delta", "reason"], rows));
    writeLine("");
  }
}

type SuccessResult = Extract<HousekeepResult, { ok: true }>;

function reportHygieneError(result: Extract<HousekeepResult, { ok: false }>, json: boolean): void {
  if (json) {
    writeJson({ ok: false, reason: result.reason, message: result.message });
    return;
  }
  if (result.reason === "unconfigured") {
    writeLine(
      "Skills root not configured. Set CONTROL_PLANE_SKILLS_ROOTS or place skills under ~/.claude/skills."
    );
  } else {
    writeLine(
      `Failed to compute skills hygiene: ${result.reason}${result.message ? ` — ${result.message}` : ""}`
    );
  }
}

async function tryApplyArchive(result: SuccessResult, json: boolean): Promise<SuccessResult | 1> {
  if (result.deadWeight.length === 0) return result;
  try {
    await applyArchive(result.deadWeight);
    return { ...result, applied: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (json) {
      writeJson({ ok: false, reason: "error", message: msg });
    } else {
      writeLine(`Archive failed: ${msg}`);
    }
    return 1;
  }
}

export async function runSkillsHousekeep(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    apply?: boolean;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    apply: { type: "boolean" },
  });

  const mode = resolveOutputMode(values);
  const apply = values.apply === true;

  const raw = await skillsHousekeepTool.handler({});
  if (!raw.ok) {
    reportHygieneError(raw, mode.json);
    return 1;
  }

  let result: SuccessResult = raw;
  if (apply) {
    const archiveResult = await tryApplyArchive(result, mode.json);
    if (archiveResult === 1) return 1;
    result = archiveResult;
  }

  if (mode.json) {
    writeJson({
      ok: true,
      applied: result.applied,
      deadWeight: result.deadWeight,
      coldGiants: result.coldGiants,
      negativeEfficacy: result.negativeEfficacy,
      totals: result.totals,
    });
    return 0;
  }

  renderPrettyHousekeep(result);
  return 0;
}

import type { SkillEfficacyRow } from "./efficacy.js";
import type { SkillManifest } from "./manifests.js";
import type { SkillUsageStats } from "./usage.js";

/**
 * Pure fold that classifies the discovered skill catalogue into three hygiene
 * buckets:
 *
 *   1. `deadWeight`      — manifest on disk, zero invocations in the corpus.
 *                          Safe automatic-archival candidates (dry-run by
 *                          default; CLI `--apply` moves to `.archive/`).
 *   2. `coldGiants`      — large manifest (>8000 bytes) with low-but-nonzero
 *                          usage (1..4 invocations). Injecting these on every
 *                          auto-match session is pure context tax, but the
 *                          skill HAS been used — humans judge before archiving.
 *   3. `negativeEfficacy` — skills whose outcome delta vs the all-sessions
 *                           baseline is < -0.05 with at least 5 qualifying
 *                           sessions. Statistical rot; not auto-archivable.
 *
 * This function is pure: no filesystem, no env, no network. It takes the
 * already-computed usage + efficacy reports and the skill catalogue and
 * returns verbatim per-skill reasons the caller can quote to the user.
 *
 * Rationale thresholds match `cp audit`'s existing cold-giant definition
 * (`sizeBytes > 8000 AND invocationCount < 5`) so the two surfaces agree.
 */

export interface SkillsHygieneInput {
  readonly skills: readonly SkillManifest[];
  readonly usage: readonly SkillUsageStats[];
  readonly efficacy: readonly SkillEfficacyRow[];
}

export interface DeadWeightSkill {
  readonly skillId: string;
  readonly displayName: string;
  readonly directory: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly rootDirectory: string;
  readonly reason: string;
}

export interface ColdGiantSkill {
  readonly skillId: string;
  readonly displayName: string;
  readonly directory: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly invocationCount: number;
  readonly rootDirectory: string;
  readonly reason: string;
}

export interface NegativeEfficacySkill {
  readonly skillId: string;
  readonly displayName: string;
  readonly sessionsCount: number;
  readonly delta: number;
  readonly reason: string;
}

export interface SkillsHygieneReport {
  readonly deadWeight: readonly DeadWeightSkill[];
  readonly coldGiants: readonly ColdGiantSkill[];
  readonly negativeEfficacy: readonly NegativeEfficacySkill[];
  readonly totals: {
    readonly skillsOnDisk: number;
    readonly deadWeightCount: number;
    readonly coldGiantCount: number;
    readonly negativeEfficacyCount: number;
    readonly deadWeightBytes: number;
  };
}

export const COLD_GIANT_SIZE_THRESHOLD_BYTES = 8000;
export const COLD_GIANT_MAX_INVOCATIONS = 5;
export const NEGATIVE_EFFICACY_DELTA_THRESHOLD = -0.05;
export const NEGATIVE_EFFICACY_MIN_SESSIONS = 5;

interface SkillBuckets {
  deadWeight: DeadWeightSkill[];
  coldGiants: ColdGiantSkill[];
  deadWeightBytes: number;
}

function classifySkills(
  skills: readonly SkillManifest[],
  usageById: Map<string, SkillUsageStats>
): SkillBuckets {
  const deadWeight: DeadWeightSkill[] = [];
  const coldGiants: ColdGiantSkill[] = [];
  let deadWeightBytes = 0;

  for (const skill of skills) {
    const usage = usageById.get(skill.id);
    const invocationCount = usage?.invocationCount ?? 0;

    if (invocationCount === 0) {
      deadWeight.push({
        skillId: skill.id,
        displayName: skill.name,
        directory: skill.directory,
        filePath: skill.filePath,
        sizeBytes: skill.sizeBytes,
        rootDirectory: skill.rootDirectory,
        reason: `Dead weight: 0 invocations across scanned sessions (${skill.sizeBytes} bytes on disk).`,
      });
      deadWeightBytes += skill.sizeBytes;
      continue;
    }

    if (
      skill.sizeBytes > COLD_GIANT_SIZE_THRESHOLD_BYTES &&
      invocationCount < COLD_GIANT_MAX_INVOCATIONS
    ) {
      coldGiants.push({
        skillId: skill.id,
        displayName: skill.name,
        directory: skill.directory,
        filePath: skill.filePath,
        sizeBytes: skill.sizeBytes,
        invocationCount,
        rootDirectory: skill.rootDirectory,
        reason: `Cold giant: ${skill.sizeBytes} bytes on disk, only ${invocationCount} invocation${invocationCount === 1 ? "" : "s"}.`,
      });
    }
  }

  return { deadWeight, coldGiants, deadWeightBytes };
}

function classifyNegativeEfficacy(efficacy: readonly SkillEfficacyRow[]): NegativeEfficacySkill[] {
  const result: NegativeEfficacySkill[] = [];
  for (const row of efficacy) {
    if (
      row.delta < NEGATIVE_EFFICACY_DELTA_THRESHOLD &&
      row.sessionsCount >= NEGATIVE_EFFICACY_MIN_SESSIONS
    ) {
      result.push({
        skillId: row.skillId,
        displayName: row.displayName,
        sessionsCount: row.sessionsCount,
        delta: row.delta,
        reason: `Negative efficacy: delta ${row.delta.toFixed(3)} over ${row.sessionsCount} sessions (threshold Δ < ${NEGATIVE_EFFICACY_DELTA_THRESHOLD}, n >= ${NEGATIVE_EFFICACY_MIN_SESSIONS}).`,
      });
    }
  }
  return result;
}

export function computeSkillsHygiene(input: SkillsHygieneInput): SkillsHygieneReport {
  const usageById = new Map<string, SkillUsageStats>();
  for (const row of input.usage) {
    usageById.set(row.skillId, row);
  }

  const { deadWeight, coldGiants, deadWeightBytes } = classifySkills(input.skills, usageById);
  const negativeEfficacy = classifyNegativeEfficacy(input.efficacy);

  deadWeight.sort(
    (a, b) => b.sizeBytes - a.sizeBytes || a.displayName.localeCompare(b.displayName)
  );
  coldGiants.sort(
    (a, b) => b.sizeBytes - a.sizeBytes || a.displayName.localeCompare(b.displayName)
  );
  negativeEfficacy.sort((a, b) => a.delta - b.delta || b.sessionsCount - a.sessionsCount);

  return {
    deadWeight,
    coldGiants,
    negativeEfficacy,
    totals: {
      skillsOnDisk: input.skills.length,
      deadWeightCount: deadWeight.length,
      coldGiantCount: coldGiants.length,
      negativeEfficacyCount: negativeEfficacy.length,
      deadWeightBytes,
    },
  };
}

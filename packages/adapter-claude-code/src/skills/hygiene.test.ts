import { describe, expect, it } from "vitest";

import {
  COLD_GIANT_MAX_INVOCATIONS,
  COLD_GIANT_SIZE_THRESHOLD_BYTES,
  computeSkillsHygiene,
  NEGATIVE_EFFICACY_DELTA_THRESHOLD,
  NEGATIVE_EFFICACY_MIN_SESSIONS,
} from "./hygiene.js";

import type { SkillEfficacyRow } from "./efficacy.js";
import type { SkillManifest } from "./manifests.js";
import type { SkillUsageStats } from "./usage.js";

// ---------- Builders ----------

function skill(overrides: Partial<SkillManifest> & { id: string; name?: string }): SkillManifest {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    description: overrides.description ?? null,
    summary: overrides.summary ?? null,
    triggers: overrides.triggers ?? [],
    filePath: overrides.filePath ?? `/fake/${overrides.id}/SKILL.md`,
    directory: overrides.directory ?? `/fake/${overrides.id}`,
    relativePath: overrides.relativePath ?? overrides.id,
    rootDirectory: overrides.rootDirectory ?? "/fake",
    rootLabel: overrides.rootLabel ?? "/fake",
    rootOrigin: overrides.rootOrigin ?? "env",
    sizeBytes: overrides.sizeBytes ?? 0,
    modifiedAt: overrides.modifiedAt ?? "2026-01-01T00:00:00.000Z",
    frontmatter: overrides.frontmatter ?? {},
    body: overrides.body ?? "",
  };
}

function usageFor(
  overrides: Partial<SkillUsageStats> & { skillId: string; invocationCount: number }
): SkillUsageStats {
  return {
    skillId: overrides.skillId,
    displayName: overrides.displayName ?? overrides.skillId,
    known: overrides.known ?? true,
    invocationCount: overrides.invocationCount,
    firstInvokedAt: overrides.firstInvokedAt ?? null,
    lastInvokedAt: overrides.lastInvokedAt ?? null,
    sizeBytes: overrides.sizeBytes ?? 0,
    approxTokens: overrides.approxTokens ?? 0,
    bytesInjected: overrides.bytesInjected ?? 0,
    tokensInjected: overrides.tokensInjected ?? 0,
    perProject: overrides.perProject ?? [],
    perHourOfDay: overrides.perHourOfDay ?? new Array<number>(24).fill(0),
    perDayOfWeek: overrides.perDayOfWeek ?? new Array<number>(7).fill(0),
    perDay: overrides.perDay ?? [],
  };
}

function efficacyFor(
  overrides: Partial<SkillEfficacyRow> & {
    skillId: string;
    delta: number;
    sessionsCount: number;
  }
): SkillEfficacyRow {
  return {
    skillId: overrides.skillId,
    displayName: overrides.displayName ?? overrides.skillId,
    known: overrides.known ?? true,
    sessionsCount: overrides.sessionsCount,
    invocationsCount: overrides.invocationsCount ?? overrides.sessionsCount,
    avgSatisfaction: overrides.avgSatisfaction ?? 0.5,
    avgOutcomeMultiplier: overrides.avgOutcomeMultiplier ?? 0.8,
    avgEffectiveScore: overrides.avgEffectiveScore ?? 0.4,
    delta: overrides.delta,
    outcomeBreakdown: overrides.outcomeBreakdown ?? {
      completed: 0,
      partial: 0,
      abandoned: 0,
      unknown: 0,
    },
    qualifying: overrides.qualifying ?? overrides.sessionsCount >= 3,
  };
}

// ---------- Tests ----------

describe("computeSkillsHygiene", () => {
  it("given_skill_on_disk_with_zero_invocations__then_classifies_as_dead_weight", () => {
    const report = computeSkillsHygiene({
      skills: [skill({ id: "never-used", sizeBytes: 512 })],
      usage: [],
      efficacy: [],
    });

    expect(report.deadWeight).toHaveLength(1);
    expect(report.deadWeight[0]?.skillId).toBe("never-used");
    expect(report.deadWeight[0]?.sizeBytes).toBe(512);
    expect(report.deadWeight[0]?.reason).toContain("0 invocations");
    expect(report.coldGiants).toEqual([]);
    expect(report.negativeEfficacy).toEqual([]);
    expect(report.totals.deadWeightCount).toBe(1);
    expect(report.totals.deadWeightBytes).toBe(512);
  });

  it("given_skill_with_explicit_zero_invocation_stat__then_still_dead_weight", () => {
    const report = computeSkillsHygiene({
      skills: [skill({ id: "seen-but-idle", sizeBytes: 1024 })],
      usage: [usageFor({ skillId: "seen-but-idle", invocationCount: 0 })],
      efficacy: [],
    });

    expect(report.deadWeight.map((s) => s.skillId)).toEqual(["seen-but-idle"]);
    expect(report.coldGiants).toEqual([]);
  });

  it("given_large_skill_with_low_usage__then_classifies_as_cold_giant", () => {
    const bigSize = COLD_GIANT_SIZE_THRESHOLD_BYTES + 1000;
    const report = computeSkillsHygiene({
      skills: [skill({ id: "chunky", sizeBytes: bigSize })],
      usage: [usageFor({ skillId: "chunky", invocationCount: 2, sizeBytes: bigSize })],
      efficacy: [],
    });

    expect(report.coldGiants).toHaveLength(1);
    expect(report.coldGiants[0]?.skillId).toBe("chunky");
    expect(report.coldGiants[0]?.invocationCount).toBe(2);
    expect(report.coldGiants[0]?.reason).toContain(String(bigSize));
    expect(report.coldGiants[0]?.reason).toContain("2 invocations");
    expect(report.deadWeight).toEqual([]);
  });

  it("given_large_skill_at_exact_max_invocations__then_not_cold_giant", () => {
    const report = computeSkillsHygiene({
      skills: [skill({ id: "borderline", sizeBytes: COLD_GIANT_SIZE_THRESHOLD_BYTES + 1 })],
      usage: [usageFor({ skillId: "borderline", invocationCount: COLD_GIANT_MAX_INVOCATIONS })],
      efficacy: [],
    });

    expect(report.coldGiants).toEqual([]);
    expect(report.deadWeight).toEqual([]);
  });

  it("given_small_skill_with_low_usage__then_not_cold_giant", () => {
    const report = computeSkillsHygiene({
      skills: [skill({ id: "tiny", sizeBytes: COLD_GIANT_SIZE_THRESHOLD_BYTES })],
      usage: [usageFor({ skillId: "tiny", invocationCount: 1 })],
      efficacy: [],
    });

    expect(report.coldGiants).toEqual([]);
    expect(report.deadWeight).toEqual([]);
  });

  it("given_efficacy_delta_below_threshold_with_enough_sessions__then_flags_negative_efficacy", () => {
    const report = computeSkillsHygiene({
      skills: [],
      usage: [],
      efficacy: [
        efficacyFor({
          skillId: "regressor",
          delta: NEGATIVE_EFFICACY_DELTA_THRESHOLD - 0.1,
          sessionsCount: NEGATIVE_EFFICACY_MIN_SESSIONS,
        }),
      ],
    });

    expect(report.negativeEfficacy).toHaveLength(1);
    expect(report.negativeEfficacy[0]?.skillId).toBe("regressor");
    expect(report.negativeEfficacy[0]?.reason).toContain("Negative efficacy");
  });

  it("given_negative_delta_but_too_few_sessions__then_not_flagged", () => {
    const report = computeSkillsHygiene({
      skills: [],
      usage: [],
      efficacy: [
        efficacyFor({
          skillId: "underpowered",
          delta: -0.5,
          sessionsCount: NEGATIVE_EFFICACY_MIN_SESSIONS - 1,
        }),
      ],
    });

    expect(report.negativeEfficacy).toEqual([]);
  });

  it("given_delta_just_above_threshold__then_not_flagged", () => {
    const report = computeSkillsHygiene({
      skills: [],
      usage: [],
      efficacy: [
        efficacyFor({
          skillId: "neutral",
          delta: NEGATIVE_EFFICACY_DELTA_THRESHOLD,
          sessionsCount: 10,
        }),
      ],
    });

    expect(report.negativeEfficacy).toEqual([]);
  });

  it("given_mixed_fixture__then_sorts_dead_weight_by_size_and_giants_by_size_and_efficacy_by_delta", () => {
    const big = COLD_GIANT_SIZE_THRESHOLD_BYTES + 5000;
    const mid = COLD_GIANT_SIZE_THRESHOLD_BYTES + 2000;
    const report = computeSkillsHygiene({
      skills: [
        skill({ id: "dead-small", sizeBytes: 100 }),
        skill({ id: "dead-big", sizeBytes: 5000 }),
        skill({ id: "giant-mid", sizeBytes: mid }),
        skill({ id: "giant-big", sizeBytes: big }),
        skill({ id: "healthy", sizeBytes: 200 }),
      ],
      usage: [
        usageFor({ skillId: "giant-mid", invocationCount: 1, sizeBytes: mid }),
        usageFor({ skillId: "giant-big", invocationCount: 3, sizeBytes: big }),
        usageFor({ skillId: "healthy", invocationCount: 50 }),
      ],
      efficacy: [
        efficacyFor({ skillId: "ok", delta: 0.1, sessionsCount: 20 }),
        efficacyFor({ skillId: "bad-a", delta: -0.2, sessionsCount: 10 }),
        efficacyFor({ skillId: "bad-b", delta: -0.5, sessionsCount: 10 }),
      ],
    });

    expect(report.deadWeight.map((d) => d.skillId)).toEqual(["dead-big", "dead-small"]);
    expect(report.coldGiants.map((d) => d.skillId)).toEqual(["giant-big", "giant-mid"]);
    expect(report.negativeEfficacy.map((d) => d.skillId)).toEqual(["bad-b", "bad-a"]);
    expect(report.totals.skillsOnDisk).toBe(5);
    expect(report.totals.deadWeightBytes).toBe(5100);
  });

  it("given_empty_input__then_returns_empty_buckets", () => {
    const report = computeSkillsHygiene({ skills: [], usage: [], efficacy: [] });
    expect(report.deadWeight).toEqual([]);
    expect(report.coldGiants).toEqual([]);
    expect(report.negativeEfficacy).toEqual([]);
    expect(report.totals).toEqual({
      skillsOnDisk: 0,
      deadWeightCount: 0,
      coldGiantCount: 0,
      negativeEfficacyCount: 0,
      deadWeightBytes: 0,
    });
  });
});

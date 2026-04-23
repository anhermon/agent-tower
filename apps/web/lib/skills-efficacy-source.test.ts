import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillManifest } from "./skills-source";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir()
  };
});

const { CLAUDE_DATA_ROOT_ENV } = await import("./sessions-source");
const { __clearSkillsEfficacyCacheForTests, computeSkillsEfficacy } = await import(
  "./skills-efficacy-source"
);

function manifest(overrides: Partial<SkillManifest> & { id: string; name: string }): SkillManifest {
  return {
    id: overrides.id,
    name: overrides.name,
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
    body: overrides.body ?? ""
  };
}

// ---------- JSONL entry builders ----------

type ContentBlock =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool_use";
      readonly id: string;
      readonly name: string;
      readonly input: Record<string, unknown>;
    }
  | {
      readonly type: "tool_result";
      readonly tool_use_id: string;
      readonly content: string;
      readonly is_error?: boolean;
    };

function userEntry(opts: {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly text: string;
}): Record<string, unknown> {
  return {
    type: "user",
    sessionId: opts.sessionId,
    timestamp: opts.timestamp,
    cwd: "/repo/x",
    message: { role: "user", content: [{ type: "text", text: opts.text }] }
  };
}

function userToolResultEntry(opts: {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly toolUseId: string;
  readonly content: string;
  readonly isError?: boolean;
}): Record<string, unknown> {
  const block: ContentBlock = {
    type: "tool_result",
    tool_use_id: opts.toolUseId,
    content: opts.content,
    is_error: opts.isError ?? false
  };
  return {
    type: "user",
    sessionId: opts.sessionId,
    timestamp: opts.timestamp,
    cwd: "/repo/x",
    message: { role: "user", content: [block] }
  };
}

function assistantTextEntry(opts: {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly text: string;
}): Record<string, unknown> {
  return {
    type: "assistant",
    sessionId: opts.sessionId,
    timestamp: opts.timestamp,
    cwd: "/repo/x",
    message: {
      role: "assistant",
      model: "claude-test",
      content: [{ type: "text", text: opts.text }]
    }
  };
}

function assistantSkillEntry(opts: {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly skill: string;
  readonly toolUseId: string;
  readonly includeText?: string;
}): Record<string, unknown> {
  const content: ContentBlock[] = [];
  if (opts.includeText) content.push({ type: "text", text: opts.includeText });
  content.push({
    type: "tool_use",
    id: opts.toolUseId,
    name: "Skill",
    input: { skill: opts.skill }
  });
  return {
    type: "assistant",
    sessionId: opts.sessionId,
    timestamp: opts.timestamp,
    cwd: "/repo/x",
    message: { role: "assistant", model: "claude-test", content }
  };
}

async function writeJsonl(dir: string, sessionId: string, entries: readonly unknown[]): Promise<string> {
  const filePath = path.join(dir, `${sessionId}.jsonl`);
  await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n"), "utf8");
  return filePath;
}

// ---------- Tests ----------

describe("skills-efficacy-source", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "control-plane-skills-efficacy-home-"));
    tempDirs.push(sandbox);
    mockedHome = sandbox;
    __clearSkillsEfficacyCacheForTests();
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env[CLAUDE_DATA_ROOT_ENV];
    } else {
      process.env[CLAUDE_DATA_ROOT_ENV] = originalEnv;
    }
    mockedHome = null;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  async function makeDataRoot(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "control-plane-skills-efficacy-data-"));
    tempDirs.push(dir);
    return dir;
  }

  it("given_no_env_and_no_home_fallback__when_computing__then_returns_unconfigured", async () => {
    const result = await computeSkillsEfficacy({ skills: [] });
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("given_empty_data_root__when_computing__then_returns_ok_with_zero_baseline", async () => {
    const root = await makeDataRoot();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await computeSkillsEfficacy({ skills: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.baseline).toEqual({
      satisfaction: 0,
      outcomeMultiplier: 0,
      effectiveScore: 0,
      sessionsScored: 0
    });
    expect(result.report.sessionsAnalyzed).toBe(0);
    expect(result.report.sessionsWithSkill).toBe(0);
    expect(result.report.skillsProfiled).toBe(0);
    expect(result.report.qualifying).toEqual([]);
    expect(result.report.insufficientData).toEqual([]);
    expect(result.report.outcomeDistribution).toEqual({
      completed: 0,
      partial: 0,
      abandoned: 0,
      unknown: 0
    });
    expect(result.report.minSessionsForQualifying).toBe(3);
  });

  it("given_completed_session_with_two_skill_invocations__when_computing__then_outcome_completed_and_delta_zero", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "proj-a");
    await mkdir(project, { recursive: true });
    const sessionId = "11111111-2222-3333-4444-555555555555";

    const entries = [
      userEntry({
        timestamp: "2026-04-01T10:00:00.000Z",
        sessionId,
        text: "please use the alpha skill"
      }),
      assistantSkillEntry({
        timestamp: "2026-04-01T10:00:01.000Z",
        sessionId,
        skill: "alpha",
        toolUseId: "tu-1"
      }),
      userToolResultEntry({
        timestamp: "2026-04-01T10:00:02.000Z",
        sessionId,
        toolUseId: "tu-1",
        content: "ok"
      }),
      assistantSkillEntry({
        timestamp: "2026-04-01T10:00:03.000Z",
        sessionId,
        skill: "alpha",
        toolUseId: "tu-2"
      }),
      userToolResultEntry({
        timestamp: "2026-04-01T10:00:04.000Z",
        sessionId,
        toolUseId: "tu-2",
        content: "ok"
      }),
      assistantTextEntry({
        timestamp: "2026-04-01T10:00:05.000Z",
        sessionId,
        text: "Done with alpha."
      })
    ];
    await writeJsonl(project, sessionId, entries);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsEfficacy({
      skills: [manifest({ id: "alpha", name: "Alpha" })],
      minSessionsForQualifying: 1
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.report.sessionsAnalyzed).toBe(1);
    expect(result.report.outcomeDistribution.completed).toBe(1);
    expect(result.report.baseline.outcomeMultiplier).toBe(1.0);

    const alphaRow =
      result.report.qualifying.find((r) => r.skillId === "alpha") ??
      result.report.insufficientData.find((r) => r.skillId === "alpha");
    expect(alphaRow).toBeDefined();
    if (!alphaRow) return;
    expect(alphaRow.known).toBe(true);
    expect(alphaRow.displayName).toBe("Alpha");
    expect(alphaRow.sessionsCount).toBe(1);
    expect(alphaRow.invocationsCount).toBe(2);
    expect(alphaRow.avgOutcomeMultiplier).toBe(1.0);
    expect(alphaRow.avgEffectiveScore).toBe(alphaRow.avgSatisfaction);
    expect(alphaRow.delta).toBe(0);
  });

  it("given_session_with_orphan_tool_use_and_errors__when_computing__then_outcome_partial", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "proj-partial");
    await mkdir(project, { recursive: true });
    const sessionId = "22222222-3333-4444-5555-666666666666";

    // Use a recent timestamp so `lastEntryAgeMs > 6h` does not escalate the
    // orphan tool_use into `abandoned`.
    const recent = new Date(Date.now() - 60_000).toISOString();
    const entries = [
      userEntry({
        timestamp: recent,
        sessionId,
        text: "use beta please"
      }),
      assistantSkillEntry({
        timestamp: recent,
        sessionId,
        skill: "beta",
        toolUseId: "err-1"
      }),
      userToolResultEntry({
        timestamp: recent,
        sessionId,
        toolUseId: "err-1",
        content: "Error: boom",
        isError: true
      }),
      assistantSkillEntry({
        timestamp: recent,
        sessionId,
        skill: "beta",
        toolUseId: "err-2"
      }),
      userToolResultEntry({
        timestamp: recent,
        sessionId,
        toolUseId: "err-2",
        content: "Error: still boom",
        isError: true
      }),
      // Final assistant ends with orphan tool_use — no matching tool_result.
      assistantSkillEntry({
        timestamp: recent,
        sessionId,
        skill: "beta",
        toolUseId: "orphan-9"
      })
    ];
    await writeJsonl(project, sessionId, entries);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsEfficacy({
      skills: [],
      minSessionsForQualifying: 1
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.outcomeDistribution.partial).toBe(1);
    expect(result.report.baseline.outcomeMultiplier).toBe(0.7);
    const row =
      result.report.qualifying.find((r) => r.skillId === "beta") ??
      result.report.insufficientData.find((r) => r.skillId === "beta");
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.avgOutcomeMultiplier).toBe(0.7);
  });

  it("given_tiny_session_with_interrupt__when_computing__then_outcome_abandoned", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "proj-abandoned");
    await mkdir(project, { recursive: true });
    const sessionId = "33333333-4444-5555-6666-777777777777";

    const entries = [
      userEntry({
        timestamp: "2026-04-03T10:00:00.000Z",
        sessionId,
        text: "hi there"
      }),
      userEntry({
        timestamp: "2026-04-03T10:00:01.000Z",
        sessionId,
        text: "[Request interrupted by user]"
      })
    ];
    await writeJsonl(project, sessionId, entries);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsEfficacy({ skills: [], minSessionsForQualifying: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.outcomeDistribution.abandoned).toBe(1);
    expect(result.report.baseline.outcomeMultiplier).toBe(0.3);
  });

  it("given_three_beta_sessions_and_one_alpha__when_min_sessions_3__then_beta_qualifies_alpha_insufficient", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "proj-multi");
    await mkdir(project, { recursive: true });

    async function writeCompleted(sessionId: string, skill: string, baseTs: string): Promise<void> {
      const entries = [
        userEntry({ timestamp: baseTs, sessionId, text: `please ${skill}` }),
        assistantSkillEntry({
          timestamp: baseTs,
          sessionId,
          skill,
          toolUseId: `${sessionId}-tu-1`
        }),
        userToolResultEntry({
          timestamp: baseTs,
          sessionId,
          toolUseId: `${sessionId}-tu-1`,
          content: "ok"
        }),
        assistantTextEntry({ timestamp: baseTs, sessionId, text: "Done." })
      ];
      await writeJsonl(project, sessionId, entries);
    }

    await writeCompleted(
      "beta1111-0000-0000-0000-000000000001",
      "beta",
      "2026-04-04T10:00:00.000Z"
    );
    await writeCompleted(
      "beta2222-0000-0000-0000-000000000002",
      "beta",
      "2026-04-04T11:00:00.000Z"
    );
    await writeCompleted(
      "beta3333-0000-0000-0000-000000000003",
      "beta",
      "2026-04-04T12:00:00.000Z"
    );
    await writeCompleted(
      "alphaxxx-0000-0000-0000-000000000004",
      "alpha",
      "2026-04-04T13:00:00.000Z"
    );

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsEfficacy({ skills: [], minSessionsForQualifying: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.sessionsAnalyzed).toBe(4);
    expect(result.report.sessionsWithSkill).toBe(4);

    const qualifyingIds = result.report.qualifying.map((r) => r.skillId);
    const insufficientIds = result.report.insufficientData.map((r) => r.skillId);
    expect(qualifyingIds).toEqual(["beta"]);
    expect(insufficientIds).toEqual(["alpha"]);

    const beta = result.report.qualifying[0]!;
    expect(beta.sessionsCount).toBe(3);
    expect(beta.qualifying).toBe(true);
    const alpha = result.report.insufficientData[0]!;
    expect(alpha.sessionsCount).toBe(1);
    expect(alpha.qualifying).toBe(false);
  });

  it("given_many_corrections_and_interrupts__when_computing__then_satisfaction_clamps_to_zero", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "proj-clamp-low");
    await mkdir(project, { recursive: true });
    const sessionId = "44444444-5555-6666-7777-888888888888";

    const entries = [
      userEntry({
        timestamp: "2026-04-05T10:00:00.000Z",
        sessionId,
        text: "no, that is wrong"
      }),
      userEntry({
        timestamp: "2026-04-05T10:00:01.000Z",
        sessionId,
        text: "stop, don't do that"
      }),
      userEntry({
        timestamp: "2026-04-05T10:00:02.000Z",
        sessionId,
        text: "actually, do it differently"
      }),
      userEntry({
        timestamp: "2026-04-05T10:00:03.000Z",
        sessionId,
        text: "instead, try that"
      }),
      userEntry({
        timestamp: "2026-04-05T10:00:04.000Z",
        sessionId,
        text: "[Request interrupted by user]"
      }),
      userEntry({
        timestamp: "2026-04-05T10:00:05.000Z",
        sessionId,
        text: "[Request interrupted by user]"
      }),
      userEntry({
        timestamp: "2026-04-05T10:00:06.000Z",
        sessionId,
        text: "[Request interrupted by user]"
      }),
      assistantSkillEntry({
        timestamp: "2026-04-05T10:00:07.000Z",
        sessionId,
        skill: "gamma",
        toolUseId: "g-1"
      }),
      userToolResultEntry({
        timestamp: "2026-04-05T10:00:08.000Z",
        sessionId,
        toolUseId: "g-1",
        content: "Error: fail",
        isError: true
      })
    ];
    await writeJsonl(project, sessionId, entries);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsEfficacy({ skills: [], minSessionsForQualifying: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.baseline.satisfaction).toBe(0);
  });

  it("given_many_positive_signals_and_no_errors__when_computing__then_satisfaction_clamps_to_one", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "proj-clamp-high");
    await mkdir(project, { recursive: true });
    const sessionId = "55555555-6666-7777-8888-999999999999";

    const entries: Record<string, unknown>[] = [];
    let t = 0;
    for (const msg of [
      "thanks so much",
      "perfect work",
      "great job",
      "awesome output",
      "nice work",
      "nicely done"
    ]) {
      entries.push(
        userEntry({
          timestamp: `2026-04-06T10:00:0${t}.000Z`,
          sessionId,
          text: msg
        })
      );
      t += 1;
    }
    entries.push(
      assistantSkillEntry({
        timestamp: `2026-04-06T10:00:0${t}.000Z`,
        sessionId,
        skill: "delta",
        toolUseId: "d-1"
      })
    );
    t += 1;
    entries.push(
      userToolResultEntry({
        timestamp: `2026-04-06T10:00:0${t}.000Z`,
        sessionId,
        toolUseId: "d-1",
        content: "ok"
      })
    );
    t += 1;
    entries.push(
      assistantTextEntry({
        timestamp: `2026-04-06T10:00:0${t}.000Z`,
        sessionId,
        text: "Here you go."
      })
    );

    await writeJsonl(project, sessionId, entries);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsEfficacy({ skills: [], minSessionsForQualifying: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Upper-bound clamp: score is never allowed to exceed 1 regardless of
    // how many positive signals pile up.
    expect(result.report.baseline.satisfaction).toBeLessThanOrEqual(1);
    expect(result.report.baseline.satisfaction).toBeGreaterThanOrEqual(0.8);
    expect(result.report.baseline.effectiveScore).toBeLessThanOrEqual(1);
  });

  it("given_unchanged_mtime__when_computing_twice__then_cache_serves_stale_summary", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "cache-proj");
    await mkdir(project, { recursive: true });
    const sessionId = "66666666-7777-8888-9999-aaaaaaaaaaaa";

    const baseEntries = [
      userEntry({ timestamp: "2026-04-07T10:00:00.000Z", sessionId, text: "go epsilon" }),
      assistantSkillEntry({
        timestamp: "2026-04-07T10:00:01.000Z",
        sessionId,
        skill: "epsilon",
        toolUseId: "e-1"
      }),
      userToolResultEntry({
        timestamp: "2026-04-07T10:00:02.000Z",
        sessionId,
        toolUseId: "e-1",
        content: "ok"
      }),
      assistantTextEntry({
        timestamp: "2026-04-07T10:00:03.000Z",
        sessionId,
        text: "Done."
      })
    ];
    const filePath = await writeJsonl(project, sessionId, baseEntries);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const first = await computeSkillsEfficacy({ skills: [], minSessionsForQualifying: 1 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstRow =
      first.report.qualifying.find((r) => r.skillId === "epsilon") ??
      first.report.insufficientData.find((r) => r.skillId === "epsilon");
    expect(firstRow?.invocationsCount).toBe(1);

    const originalStat = await stat(filePath);
    const originalMtime = originalStat.mtime;

    // Append another invocation and reset mtime.
    const extended = [
      ...baseEntries,
      assistantSkillEntry({
        timestamp: "2026-04-07T10:00:04.000Z",
        sessionId,
        skill: "epsilon",
        toolUseId: "e-2"
      }),
      userToolResultEntry({
        timestamp: "2026-04-07T10:00:05.000Z",
        sessionId,
        toolUseId: "e-2",
        content: "ok"
      }),
      assistantTextEntry({
        timestamp: "2026-04-07T10:00:06.000Z",
        sessionId,
        text: "Done again."
      })
    ];
    await writeFile(filePath, extended.map((e) => JSON.stringify(e)).join("\n"), "utf8");
    await utimes(filePath, originalMtime, originalMtime);

    // Same mtime → cache hit → still 1 invocation.
    const cached = await computeSkillsEfficacy({ skills: [], minSessionsForQualifying: 1 });
    expect(cached.ok).toBe(true);
    if (!cached.ok) return;
    const cachedRow =
      cached.report.qualifying.find((r) => r.skillId === "epsilon") ??
      cached.report.insufficientData.find((r) => r.skillId === "epsilon");
    expect(cachedRow?.invocationsCount).toBe(1);

    // Bump mtime → cache invalidates → fresh count of 2.
    const future = new Date(originalMtime.getTime() + 60_000);
    await utimes(filePath, future, future);

    const fresh = await computeSkillsEfficacy({ skills: [], minSessionsForQualifying: 1 });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    const freshRow =
      fresh.report.qualifying.find((r) => r.skillId === "epsilon") ??
      fresh.report.insufficientData.find((r) => r.skillId === "epsilon");
    expect(freshRow?.invocationsCount).toBe(2);
  });
});

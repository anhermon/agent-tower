import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillManifest } from "./manifests.js";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

const { CLAUDE_DATA_ROOT_ENV } = await import("../data-root.js");

const { __clearSkillsUsageCacheForTests, computeSkillsUsage } = await import("./usage.js");

interface ToolUseInput {
  readonly skill: string;
  readonly args?: string;
}

interface ToolUseBlock {
  readonly type: "tool_use";
  readonly name: string;
  readonly input: ToolUseInput;
}

interface AssistantEntry {
  readonly type: "assistant";
  readonly timestamp: string;
  readonly sessionId: string;
  readonly cwd: string;
  readonly message: {
    readonly role: "assistant";
    readonly content: readonly ToolUseBlock[] | string;
  };
}

function assistantWithSkill(opts: {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly cwd: string;
  readonly skill: string;
}): AssistantEntry {
  return {
    type: "assistant",
    timestamp: opts.timestamp,
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", name: "Skill", input: { skill: opts.skill, args: "x" } }],
    },
  };
}

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
    body: overrides.body ?? "",
  };
}

describe("skills-usage-source", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "control-plane-skills-usage-home-"));
    tempDirs.push(sandbox);
    mockedHome = sandbox;
    __clearSkillsUsageCacheForTests();
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
    const dir = await mkdtemp(path.join(os.tmpdir(), "control-plane-skills-usage-data-"));
    tempDirs.push(dir);
    return dir;
  }

  it("given_no_env_and_no_home_fallback__when_computing__then_returns_unconfigured", async () => {
    const result = await computeSkillsUsage({ skills: [] });
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("given_empty_data_root__when_computing__then_returns_ok_with_zeroed_totals", async () => {
    const root = await makeDataRoot();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await computeSkillsUsage({ skills: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.totals).toEqual({
      totalInvocations: 0,
      distinctSkills: 0,
      knownSkills: 0,
      unknownSkills: 0,
      totalBytesInjected: 0,
      totalTokensInjected: 0,
      sessionsScanned: 0,
      filesScanned: 0,
      firstInvokedAt: null,
      lastInvokedAt: null,
    });
    expect(result.report.perSkill).toEqual([]);
    expect(result.report.perHourOfDay).toHaveLength(24);
    expect(result.report.perDayOfWeek).toHaveLength(7);
    expect(result.report.perDay).toEqual([]);
  });

  it("given_jsonl_with_multiple_invocations__when_computing__then_counts_buckets_and_timestamps", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "sample-project");
    await mkdir(project, { recursive: true });

    const sessionId = "11111111-2222-3333-4444-555555555555";
    const entries = [
      assistantWithSkill({
        timestamp: "2026-04-01T00:31:37.727Z", // Wed UTC, hour 0
        sessionId,
        cwd: "/repo/a",
        skill: "paperclip",
      }),
      assistantWithSkill({
        timestamp: "2026-04-01T13:05:00.000Z", // Wed UTC, hour 13
        sessionId,
        cwd: "/repo/a",
        skill: "paperclip",
      }),
      assistantWithSkill({
        timestamp: "2026-04-02T10:00:00.000Z", // Thu UTC, hour 10
        sessionId,
        cwd: "/repo/b",
        skill: "graphify",
      }),
    ];
    const jsonl = entries.map((e) => JSON.stringify(e)).join("\n");
    await writeFile(path.join(project, `${sessionId}.jsonl`), jsonl, "utf8");

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsUsage({ skills: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { totals, perSkill, perHourOfDay, perDay } = result.report;
    expect(totals.totalInvocations).toBe(3);
    expect(totals.distinctSkills).toBe(2);
    expect(totals.knownSkills).toBe(0);
    expect(totals.unknownSkills).toBe(2);
    expect(totals.sessionsScanned).toBe(1);
    expect(totals.filesScanned).toBe(1);
    expect(totals.firstInvokedAt).toBe("2026-04-01T00:31:37.727Z");
    expect(totals.lastInvokedAt).toBe("2026-04-02T10:00:00.000Z");

    // perSkill sorted by invocationCount desc
    expect(perSkill.map((s) => s.skillId)).toEqual(["paperclip", "graphify"]);
    expect(perSkill[0]!.invocationCount).toBe(2);
    expect(perSkill[0]!.firstInvokedAt).toBe("2026-04-01T00:31:37.727Z");
    expect(perSkill[0]!.lastInvokedAt).toBe("2026-04-01T13:05:00.000Z");
    expect(perSkill[0]!.perHourOfDay[0]).toBe(1);
    expect(perSkill[0]!.perHourOfDay[13]).toBe(1);
    expect(perSkill[0]!.perDay).toEqual([{ date: "2026-04-01", count: 2 }]);

    expect(perHourOfDay[0]).toBe(1);
    expect(perHourOfDay[10]).toBe(1);
    expect(perHourOfDay[13]).toBe(1);
    expect(perDay).toEqual([
      { date: "2026-04-01", count: 2 },
      { date: "2026-04-02", count: 1 },
    ]);
  });

  it("given_known_and_unknown_skills__when_joining__then_manifest_metadata_is_applied", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "another-project");
    await mkdir(project, { recursive: true });

    const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const entries = [
      // joins by id
      assistantWithSkill({
        timestamp: "2026-04-10T12:00:00.000Z",
        sessionId,
        cwd: "/repo/x",
        skill: "paperclip",
      }),
      assistantWithSkill({
        timestamp: "2026-04-10T12:05:00.000Z",
        sessionId,
        cwd: "/repo/x",
        skill: "paperclip",
      }),
      // joins by frontmatter name fallback
      assistantWithSkill({
        timestamp: "2026-04-10T12:10:00.000Z",
        sessionId,
        cwd: "/repo/x",
        skill: "Graph Builder",
      }),
      // unknown
      assistantWithSkill({
        timestamp: "2026-04-10T12:20:00.000Z",
        sessionId,
        cwd: "/repo/x",
        skill: "mystery-skill",
      }),
    ];
    await writeFile(
      path.join(project, `${sessionId}.jsonl`),
      entries.map((e) => JSON.stringify(e)).join("\n"),
      "utf8"
    );
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const skills: SkillManifest[] = [
      manifest({ id: "paperclip", name: "Paperclip", sizeBytes: 4000 }),
      manifest({ id: "graphify", name: "Graph Builder", sizeBytes: 800 }),
    ];

    const result = await computeSkillsUsage({ skills });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byId = new Map(result.report.perSkill.map((s) => [s.skillId, s]));
    const paperclip = byId.get("paperclip");
    const graphify = byId.get("graphify");
    const unknown = byId.get("mystery-skill");
    expect(paperclip).toBeDefined();
    expect(graphify).toBeDefined();
    expect(unknown).toBeDefined();

    expect(paperclip!.known).toBe(true);
    expect(paperclip!.displayName).toBe("Paperclip");
    expect(paperclip!.invocationCount).toBe(2);
    expect(paperclip!.sizeBytes).toBe(4000);
    expect(paperclip!.approxTokens).toBe(1000); // ceil(4000/4)
    expect(paperclip!.bytesInjected).toBe(2 * 4000);
    expect(paperclip!.tokensInjected).toBe(2 * 1000);

    expect(graphify!.known).toBe(true);
    expect(graphify!.displayName).toBe("Graph Builder");
    expect(graphify!.sizeBytes).toBe(800);
    expect(graphify!.approxTokens).toBe(200);
    expect(graphify!.bytesInjected).toBe(800);
    expect(graphify!.tokensInjected).toBe(200);

    expect(unknown!.known).toBe(false);
    expect(unknown!.displayName).toBe("mystery-skill");
    expect(unknown!.sizeBytes).toBe(0);
    expect(unknown!.approxTokens).toBe(0);
    expect(unknown!.bytesInjected).toBe(0);
    expect(unknown!.tokensInjected).toBe(0);

    expect(result.report.totals.knownSkills).toBe(2);
    expect(result.report.totals.unknownSkills).toBe(1);
    expect(result.report.totals.totalBytesInjected).toBe(2 * 4000 + 800);
    expect(result.report.totals.totalTokensInjected).toBe(2 * 1000 + 200);
  });

  it("given_malformed_and_irrelevant_lines__when_scanning__then_only_skill_tool_uses_counted", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "noisy-project");
    await mkdir(project, { recursive: true });

    const sessionId = "ffffffff-0000-1111-2222-333333333333";
    const good = assistantWithSkill({
      timestamp: "2026-04-05T09:00:00.000Z",
      sessionId,
      cwd: "/repo/c",
      skill: "paperclip",
    });
    const bashOnly = {
      type: "assistant",
      timestamp: "2026-04-05T09:05:00.000Z",
      sessionId,
      cwd: "/repo/c",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }],
      },
    };
    const stringContent = {
      type: "assistant",
      timestamp: "2026-04-05T09:10:00.000Z",
      sessionId,
      cwd: "/repo/c",
      message: { role: "assistant", content: "plain text reply" },
    };
    const userEntry = {
      type: "user",
      timestamp: "2026-04-05T09:15:00.000Z",
      sessionId,
      cwd: "/repo/c",
      message: { role: "user", content: "hello" },
    };

    const lines = [
      JSON.stringify(good),
      "{ this is not valid json",
      "",
      JSON.stringify(bashOnly),
      JSON.stringify(stringContent),
      JSON.stringify(userEntry),
    ].join("\n");
    await writeFile(path.join(project, `${sessionId}.jsonl`), lines, "utf8");

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsUsage({ skills: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.totals.totalInvocations).toBe(1);
    expect(result.report.perSkill).toHaveLength(1);
    expect(result.report.perSkill[0]!.skillId).toBe("paperclip");
  });

  it("given_range__when_computing__then_includes_only_in_range_invocations", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "range-project");
    await mkdir(project, { recursive: true });

    const sessionId = "aaaa1111-0000-0000-0000-000000000001";
    const entries = [
      assistantWithSkill({
        timestamp: "2026-04-01T08:00:00.000Z", // outside
        sessionId,
        cwd: "/repo/r",
        skill: "paperclip",
      }),
      assistantWithSkill({
        timestamp: "2026-04-02T09:00:00.000Z", // in range
        sessionId,
        cwd: "/repo/r",
        skill: "paperclip",
      }),
      assistantWithSkill({
        timestamp: "2026-04-03T10:00:00.000Z", // in range
        sessionId,
        cwd: "/repo/r",
        skill: "graphify",
      }),
    ];
    await writeFile(
      path.join(project, `${sessionId}.jsonl`),
      entries.map((e) => JSON.stringify(e)).join("\n"),
      "utf8"
    );

    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await computeSkillsUsage({
      skills: [],
      range: { from: "2026-04-02", to: "2026-04-03" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { totals, perDay } = result.report;
    expect(totals.totalInvocations).toBe(2);
    expect(totals.firstInvokedAt).toBe("2026-04-02T09:00:00.000Z");
    expect(totals.lastInvokedAt).toBe("2026-04-03T10:00:00.000Z");
    const days = perDay.map((d) => d.date);
    expect(days.every((d) => d >= "2026-04-02" && d <= "2026-04-03")).toBe(true);
    expect(days).toEqual(["2026-04-02", "2026-04-03"]);
  });

  it("given_unchanged_mtime__when_computing_twice__then_cache_serves_stale_contents", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "cache-project");
    await mkdir(project, { recursive: true });

    const sessionId = "cccccccc-dddd-eeee-ffff-000000000000";
    const filePath = path.join(project, `${sessionId}.jsonl`);
    const first = assistantWithSkill({
      timestamp: "2026-04-06T08:00:00.000Z",
      sessionId,
      cwd: "/repo/d",
      skill: "paperclip",
    });
    await writeFile(filePath, JSON.stringify(first), "utf8");

    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const firstResult = await computeSkillsUsage({ skills: [] });
    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    expect(firstResult.report.totals.totalInvocations).toBe(1);

    // Capture the original mtime so we can restore it after rewriting.
    const originalStat = await stat(filePath);
    const originalMtime = originalStat.mtime;

    // Rewrite with additional invocations but reset mtime to the original.
    const second = assistantWithSkill({
      timestamp: "2026-04-06T09:00:00.000Z",
      sessionId,
      cwd: "/repo/d",
      skill: "paperclip",
    });
    const third = assistantWithSkill({
      timestamp: "2026-04-06T10:00:00.000Z",
      sessionId,
      cwd: "/repo/d",
      skill: "graphify",
    });
    await writeFile(
      filePath,
      [first, second, third].map((e) => JSON.stringify(e)).join("\n"),
      "utf8"
    );
    await utimes(filePath, originalMtime, originalMtime);

    // Same mtime → cache hit → stale count.
    const cachedResult = await computeSkillsUsage({ skills: [] });
    expect(cachedResult.ok).toBe(true);
    if (!cachedResult.ok) return;
    expect(cachedResult.report.totals.totalInvocations).toBe(1);

    // Bump the mtime → cache invalidates → fresh count.
    const future = new Date(originalMtime.getTime() + 60_000);
    await utimes(filePath, future, future);

    const freshResult = await computeSkillsUsage({ skills: [] });
    expect(freshResult.ok).toBe(true);
    if (!freshResult.ok) return;
    expect(freshResult.report.totals.totalInvocations).toBe(3);
    expect(freshResult.report.totals.distinctSkills).toBe(2);
  });
});

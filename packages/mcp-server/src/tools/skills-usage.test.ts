import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

const {
  CLAUDE_DATA_ROOT_ENV,
  SKILLS_ROOTS_ENV,
  __clearSkillsCacheForTests,
  __clearSkillsUsageCacheForTests,
} = await import("@control-plane/adapter-claude-code");
const { skillsUsageTool } = await import("./skills-usage.js");

function assistantWithSkill(opts: {
  readonly sessionId: string;
  readonly cwd: string;
  readonly timestamp: string;
  readonly skill: string;
}): Record<string, unknown> {
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

describe("skills_usage tool", () => {
  const originalDataEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const originalSkillsEnv = process.env[SKILLS_ROOTS_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    delete process.env[SKILLS_ROOTS_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-skuse-home-"));
    tempDirs.push(sandbox);
    mockedHome = sandbox;
    __clearSkillsCacheForTests();
    __clearSkillsUsageCacheForTests();
  });

  afterEach(async () => {
    if (originalDataEnv === undefined) delete process.env[CLAUDE_DATA_ROOT_ENV];
    else process.env[CLAUDE_DATA_ROOT_ENV] = originalDataEnv;
    if (originalSkillsEnv === undefined) delete process.env[SKILLS_ROOTS_ENV];
    else process.env[SKILLS_ROOTS_ENV] = originalSkillsEnv;
    mockedHome = null;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("returns unconfigured when no data root is resolvable", async () => {
    const result = await skillsUsageTool.handler({});
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("returns totals and sliced perSkill with heatmaps stripped per-entry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-skuse-data-"));
    tempDirs.push(root);
    const project = path.join(root, "proj-skuse");
    await mkdir(project, { recursive: true });

    const sessionId = "bbbbbbbb-1111-2222-3333-444444444444";
    const entries = [
      assistantWithSkill({
        sessionId,
        cwd: "/repo/y",
        timestamp: "2026-04-10T10:00:00.000Z",
        skill: "alpha",
      }),
      assistantWithSkill({
        sessionId,
        cwd: "/repo/y",
        timestamp: "2026-04-10T11:00:00.000Z",
        skill: "beta",
      }),
      assistantWithSkill({
        sessionId,
        cwd: "/repo/y",
        timestamp: "2026-04-10T12:00:00.000Z",
        skill: "gamma",
      }),
    ];
    await writeFile(
      path.join(project, `${sessionId}.jsonl`),
      entries.map((e) => JSON.stringify(e)).join("\n"),
      "utf8"
    );
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await skillsUsageTool.handler({ limit: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const totals = result.totals as Record<string, unknown>;
    expect(totals.totalInvocations).toBe(3);
    expect(totals.distinctSkills).toBe(3);
    const perSkill = result.perSkill as readonly Record<string, unknown>[];
    expect(perSkill).toHaveLength(2);
    expect(perSkill[0]).not.toHaveProperty("perHourOfDay");
    expect(perSkill[0]).not.toHaveProperty("perDayOfWeek");
    expect(perSkill[0]).not.toHaveProperty("perDay");
    expect(Array.isArray(result.perHourOfDay)).toBe(true);
    expect(Array.isArray(result.perDayOfWeek)).toBe(true);
    expect(Array.isArray(result.perDay)).toBe(true);
  });
});

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

const { CLAUDE_DATA_ROOT_ENV, SKILLS_ROOTS_ENV, __clearSkillsCacheForTests } = await import(
  "@control-plane/adapter-claude-code"
);
const { healthTool } = await import("./health.js");

describe("control_plane_health tool", () => {
  const originalDataEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const originalSkillsEnv = process.env[SKILLS_ROOTS_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    delete process.env[SKILLS_ROOTS_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-health-home-"));
    tempDirs.push(sandbox);
    mockedHome = sandbox;
    __clearSkillsCacheForTests();
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

  it("returns unconfigured when no data root can be resolved", async () => {
    const result = await healthTool.handler({});
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("reports sessionCount and skillCount when configured", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-health-data-"));
    tempDirs.push(dataRoot);
    const project = path.join(dataRoot, "proj-1");
    await mkdir(project, { recursive: true });
    await writeFile(path.join(project, "a.jsonl"), "", "utf8");
    await writeFile(path.join(project, "b.jsonl"), "", "utf8");

    const skillsRoot = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-health-skills-"));
    tempDirs.push(skillsRoot);
    const skillDir = path.join(skillsRoot, "sk-a");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: sk-a\n---\nBody", "utf8");

    process.env[CLAUDE_DATA_ROOT_ENV] = dataRoot;
    process.env[SKILLS_ROOTS_ENV] = skillsRoot;

    const result = await healthTool.handler({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionCount).toBe(2);
    expect(result.skillCount).toBe(1);
    expect(result.dataRoot).toMatchObject({ directory: dataRoot, origin: "env" });
  });
});

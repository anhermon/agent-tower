import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof os>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

const {
  CLAUDE_DATA_ROOT_ENV,
  SKILLS_ROOTS_ENV,
  __clearSkillsCacheForTests,
  __clearSkillsEfficacyCacheForTests,
  __clearSkillsUsageCacheForTests,
} = await import("@control-plane/adapter-claude-code");
const { skillsHousekeepTool } = await import("./skills-housekeep.js");

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
      content: [{ type: "tool_use", name: "Skill", input: { skill: opts.skill } }],
    },
  };
}

async function writeSkill(root: string, slug: string, body: string): Promise<void> {
  const dir = path.join(root, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${slug}\ndescription: test skill ${slug}\n---\n${body}`,
    "utf8"
  );
}

describe("skills_housekeep tool", () => {
  const originalData = process.env[CLAUDE_DATA_ROOT_ENV];
  const originalSkills = process.env[SKILLS_ROOTS_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    delete process.env[SKILLS_ROOTS_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-housekeep-home-"));
    tempDirs.push(sandbox);
    mockedHome = sandbox;
    __clearSkillsCacheForTests();
    __clearSkillsUsageCacheForTests();
    __clearSkillsEfficacyCacheForTests();
  });

  afterEach(async () => {
    if (originalData === undefined) delete process.env[CLAUDE_DATA_ROOT_ENV];
    else process.env[CLAUDE_DATA_ROOT_ENV] = originalData;
    if (originalSkills === undefined) delete process.env[SKILLS_ROOTS_ENV];
    else process.env[SKILLS_ROOTS_ENV] = originalSkills;
    mockedHome = null;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("returns unconfigured when no data root is resolvable", async () => {
    const result = await skillsHousekeepTool.handler({});
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("classifies dead-weight skills and returns applied=false", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-housekeep-data-"));
    tempDirs.push(dataRoot);
    const skillsRoot = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-housekeep-skills-"));
    tempDirs.push(skillsRoot);

    await writeSkill(skillsRoot, "never-used", "body");
    await writeSkill(skillsRoot, "used", "body");

    const project = path.join(dataRoot, "proj");
    await mkdir(project, { recursive: true });
    const sessionId = "aaaaaaaa-9999-8888-7777-666666666666";
    await writeFile(
      path.join(project, `${sessionId}.jsonl`),
      JSON.stringify(
        assistantWithSkill({
          sessionId,
          cwd: "/repo/x",
          timestamp: "2026-04-11T10:00:00.000Z",
          skill: "used",
        })
      ),
      "utf8"
    );

    process.env[CLAUDE_DATA_ROOT_ENV] = dataRoot;
    process.env[SKILLS_ROOTS_ENV] = skillsRoot;

    const result = await skillsHousekeepTool.handler({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toBe(false);
    const deadWeight = result.deadWeight as readonly Record<string, unknown>[];
    expect(deadWeight.map((d) => d.skillId)).toEqual(["never-used"]);
    const totals = result.totals as Record<string, number>;
    expect(totals.skillsOnDisk).toBe(2);
    expect(totals.deadWeightCount).toBe(1);
  });

  it("does not expose an apply option in the input schema", async () => {
    const schema = skillsHousekeepTool.inputSchema;
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
    expect(schema.additionalProperties).toBe(false);
  });
});

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
} = await import("@control-plane/adapter-claude-code");
const { skillsEfficacyTool } = await import("./skills-efficacy.js");

describe("skills_efficacy tool", () => {
  const originalDataEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const originalSkillsEnv = process.env[SKILLS_ROOTS_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    delete process.env[SKILLS_ROOTS_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-eff-home-"));
    tempDirs.push(sandbox);
    mockedHome = sandbox;
    __clearSkillsCacheForTests();
    __clearSkillsEfficacyCacheForTests();
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
    const result = await skillsEfficacyTool.handler({});
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("returns a shaped report and honors minSessions override", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-eff-data-"));
    tempDirs.push(root);
    const project = path.join(root, "proj-eff");
    await mkdir(project, { recursive: true });
    // Empty project — analytics still works, yielding no qualifying rows.
    await writeFile(path.join(project, "placeholder.jsonl"), "", "utf8");

    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await skillsEfficacyTool.handler({ minSessions: 2, limit: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.negativeOnly).toBe(false);
    expect(result.minSessions).toBe(2);
    expect(result.limit).toBe(5);
    expect(Array.isArray(result.skills)).toBe(true);
    expect(result.baseline).toBeDefined();
    expect(result.sessionsAnalyzed).toBeDefined();
    expect(result.outcomeDistribution).toBeDefined();
  });
});

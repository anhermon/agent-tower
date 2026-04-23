import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import {
  __clearSkillsEfficacyCacheForTests,
  CLAUDE_DATA_ROOT_ENV,
} from "@control-plane/adapter-claude-code";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureOutput } from "../test-helpers.js";
import { runSkillsEfficacy } from "./skills-efficacy.js";

describe("runSkillsEfficacy", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(() => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    __clearSkillsEfficacyCacheForTests();
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env[CLAUDE_DATA_ROOT_ENV];
    else process.env[CLAUDE_DATA_ROOT_ENV] = originalEnv;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  it("given_empty_data_root__when_running__then_no_rows_and_ok_true", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-skills-eff-"));
    tempDirs.push(root);
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runSkillsEfficacy(["--min-sessions=1"]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      rows: readonly unknown[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.rows).toEqual([]);
  });
});

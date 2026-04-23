import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import {
  __clearSkillsUsageCacheForTests,
  CLAUDE_DATA_ROOT_ENV,
} from "@control-plane/adapter-claude-code";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureOutput } from "../test-helpers.js";
import { runSkillsUsage } from "./skills-usage.js";

describe("runSkillsUsage", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(() => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    __clearSkillsUsageCacheForTests();
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env[CLAUDE_DATA_ROOT_ENV];
    else process.env[CLAUDE_DATA_ROOT_ENV] = originalEnv;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  it("given_empty_data_root__when_running__then_totals_are_zero_and_per_skill_slices", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-skills-usage-"));
    tempDirs.push(root);
    const project = path.join(root, "p");
    await mkdir(project, { recursive: true });
    await writeFile(path.join(project, "a.jsonl"), "", "utf8");
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runSkillsUsage(["--limit=3"]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      totals: { totalInvocations: number };
      perSkill: readonly unknown[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.totals.totalInvocations).toBe(0);
    expect(parsed.perSkill).toEqual([]);
  });

  it("given_invocations__when_running__then_per_skill_entries_drop_inner_series", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-skills-usage-hit-"));
    tempDirs.push(root);
    const project = path.join(root, "p");
    await mkdir(project, { recursive: true });
    const sessionId = "00000000-1111-2222-3333-444444444444";
    const line = {
      type: "assistant",
      sessionId,
      timestamp: "2026-04-10T01:00:00.000Z",
      cwd: "/r",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", name: "Skill", input: { skill: "paperclip" } }],
      },
    };
    await writeFile(path.join(project, `${sessionId}.jsonl`), JSON.stringify(line), "utf8");
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runSkillsUsage([]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      perSkill: readonly Record<string, unknown>[];
      perDay: readonly unknown[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.perSkill).toHaveLength(1);
    expect(parsed.perSkill[0]).not.toHaveProperty("perHourOfDay");
    expect(parsed.perSkill[0]).not.toHaveProperty("perDayOfWeek");
    expect(parsed.perSkill[0]).not.toHaveProperty("perDay");
    expect(Array.isArray(parsed.perDay)).toBe(true);
  });
});

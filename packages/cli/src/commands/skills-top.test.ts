import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __clearSkillsUsageCacheForTests,
  CLAUDE_DATA_ROOT_ENV,
} from "@control-plane/adapter-claude-code";

import { captureOutput } from "../test-helpers.js";

import { runSkillsTop } from "./skills-top.js";

function assistantWithSkill(opts: {
  readonly skill: string;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly cwd: string;
}): Record<string, unknown> {
  return {
    type: "assistant",
    sessionId: opts.sessionId,
    timestamp: opts.timestamp,
    cwd: opts.cwd,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", name: "Skill", input: { skill: opts.skill } }],
    },
  };
}

describe("runSkillsTop", () => {
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

  it("given_multiple_skills__when_sorting_by_invocations__then_top_is_most_used", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-skills-top-"));
    tempDirs.push(root);
    const project = path.join(root, "p");
    await mkdir(project, { recursive: true });

    const sessionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const entries = [
      assistantWithSkill({
        skill: "paperclip",
        sessionId,
        timestamp: "2026-04-10T01:00:00.000Z",
        cwd: "/r",
      }),
      assistantWithSkill({
        skill: "paperclip",
        sessionId,
        timestamp: "2026-04-10T02:00:00.000Z",
        cwd: "/r",
      }),
      assistantWithSkill({
        skill: "graphify",
        sessionId,
        timestamp: "2026-04-10T03:00:00.000Z",
        cwd: "/r",
      }),
    ];
    await writeFile(
      path.join(project, `${sessionId}.jsonl`),
      entries.map((e) => JSON.stringify(e)).join("\n"),
      "utf8"
    );
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runSkillsTop(["--limit=5"]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      skills: readonly { skillId: string; invocationCount: number }[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.skills[0]?.skillId).toBe("paperclip");
    expect(parsed.skills[0]?.invocationCount).toBe(2);
  });
});

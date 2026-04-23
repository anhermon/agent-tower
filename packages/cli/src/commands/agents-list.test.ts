import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { CLAUDE_DATA_ROOT_ENV } from "@control-plane/adapter-claude-code";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureOutput } from "../test-helpers.js";
import { runAgentsList } from "./agents-list.js";

describe("runAgentsList", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(() => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env[CLAUDE_DATA_ROOT_ENV];
    else process.env[CLAUDE_DATA_ROOT_ENV] = originalEnv;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  it("given_two_projects__when_listing__then_groups_by_project_with_prefixed_agent_id", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-agents-"));
    tempDirs.push(root);
    const projectA = path.join(root, "project-a");
    const projectB = path.join(root, "project-b");
    await mkdir(projectA, { recursive: true });
    await mkdir(projectB, { recursive: true });
    await writeFile(path.join(projectA, "s1.jsonl"), "x", "utf8");
    await writeFile(path.join(projectA, "s2.jsonl"), "xy", "utf8");
    await writeFile(path.join(projectB, "s3.jsonl"), "xyz", "utf8");
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runAgentsList([]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      agents: readonly {
        agentId: string;
        projectId: string;
        sessionCount: number;
        totalBytes: number;
      }[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.agents).toHaveLength(2);
    const byProject = Object.fromEntries(parsed.agents.map((a) => [a.projectId, a]));
    expect(byProject["project-a"]?.agentId).toBe("claude-code:project-a");
    expect(byProject["project-a"]?.sessionCount).toBe(2);
    expect(byProject["project-a"]?.totalBytes).toBe(3);
    expect(byProject["project-b"]?.sessionCount).toBe(1);
    expect(byProject["project-b"]?.totalBytes).toBe(3);
  });
});

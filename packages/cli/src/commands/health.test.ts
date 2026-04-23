import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLAUDE_DATA_ROOT_ENV } from "@control-plane/adapter-claude-code";

import { captureOutput } from "../test-helpers.js";

import { runHealth } from "./health.js";

describe("runHealth", () => {
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

  async function makeDataRoot(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-health-"));
    tempDirs.push(dir);
    return dir;
  }

  it("given_configured_data_root__when_running__then_json_payload_includes_counts", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "proj-a");
    await mkdir(project, { recursive: true });
    await writeFile(path.join(project, "session-1.jsonl"), "", "utf8");
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runHealth([]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      dataRoot: { directory: string; origin: string } | null;
      sessionCount: number;
      skillCount: number;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.dataRoot?.directory).toBe(root);
    expect(parsed.dataRoot?.origin).toBe("env");
    expect(parsed.sessionCount).toBe(1);
    expect(typeof parsed.skillCount).toBe("number");
  });

  it("given_pretty_flag__when_running__then_emits_human_readable_lines", async () => {
    const root = await makeDataRoot();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const { exitCode, stdout } = await captureOutput(() => runHealth(["--pretty"]));
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Data root:");
    expect(stdout).toContain(root);
  });
});

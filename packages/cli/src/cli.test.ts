import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLAUDE_DATA_ROOT_ENV } from "@control-plane/adapter-claude-code";

import { runCli } from "./cli.js";
import { captureOutput } from "./test-helpers.js";

describe("runCli global-flag handling", () => {
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
      if (dir) {
        try {
          await rm(dir, { recursive: true, force: true });
        } catch {}
      }
    }
  });

  async function seedTempRoot(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-cli-test-"));
    tempDirs.push(root);
    const project = path.join(root, "proj");
    await mkdir(project, { recursive: true });
    // Write a minimal session so health sees >0 sessions.
    const assistant = {
      type: "assistant" as const,
      sessionId: "test-session",
      timestamp: "2026-04-10T10:00:00.000Z",
      cwd: "/repo/p",
      message: {
        role: "assistant" as const,
        model: "claude-sonnet-4-5",
        content: [{ type: "text" as const, text: "ok" }],
        usage: { input_tokens: 3, output_tokens: 4 },
      },
    };
    await writeFile(path.join(project, "test-session.jsonl"), JSON.stringify(assistant), "utf8");
    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    return root;
  }

  it("given_pretty_flag_before_subcommand__when_dispatching__then_it_reaches_health_without_usage_error", async () => {
    await seedTempRoot();
    const { exitCode, stdout } = await captureOutput(() => runCli(["--pretty", "health"]));
    expect(exitCode).toBe(0);
    // Pretty output is not valid JSON — that's the whole point of the flag.
    expect(() => JSON.parse(stdout)).toThrow();
    expect(stdout.toLowerCase()).toMatch(/data root|sessions|skills/);
  });

  it("given_json_flag_before_subcommand__when_dispatching__then_health_emits_json", async () => {
    await seedTempRoot();
    const { exitCode, stdout } = await captureOutput(() => runCli(["--json", "health"]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("ok");
  });

  it("given_help_short_flag__when_dispatching__then_runs_help", async () => {
    const { exitCode, stdout } = await captureOutput(() => runCli(["-h"]));
    expect(exitCode).toBe(0);
    expect(stdout).toContain("cp");
  });

  it("given_no_args__when_dispatching__then_runs_help", async () => {
    const { exitCode, stdout } = await captureOutput(() => runCli([]));
    expect(exitCode).toBe(0);
    expect(stdout).toContain("cp");
  });

  it("given_unknown_command__when_dispatching__then_exits_with_usage_code", async () => {
    const { exitCode, stderr } = await captureOutput(() => runCli(["bogus"]));
    expect(exitCode).toBe(2);
    expect(stderr.toLowerCase()).toContain("unknown command");
  });
});

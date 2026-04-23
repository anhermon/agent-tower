import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLAUDE_DATA_ROOT_ENV } from "@control-plane/adapter-claude-code";

import { captureOutput } from "../test-helpers.js";

import { runSessionsTop } from "./sessions-top.js";

interface AssistantLine {
  readonly type: "assistant";
  readonly sessionId: string;
  readonly timestamp: string;
  readonly cwd: string;
  readonly message: {
    readonly role: "assistant";
    readonly model: string;
    readonly content: readonly { readonly type: "text"; readonly text: string }[];
    readonly usage: {
      readonly input_tokens: number;
      readonly output_tokens: number;
      readonly cache_read_input_tokens: number;
      readonly cache_creation_input_tokens: number;
    };
  };
}

function assistantLine(args: {
  readonly sessionId: string;
  readonly timestamp: string;
  readonly cwd: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}): AssistantLine {
  return {
    type: "assistant",
    sessionId: args.sessionId,
    timestamp: args.timestamp,
    cwd: args.cwd,
    message: {
      role: "assistant",
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text: "hi" }],
      usage: {
        input_tokens: args.inputTokens,
        output_tokens: args.outputTokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  };
}

describe("runSessionsTop", () => {
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
    const dir = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-sessions-top-"));
    tempDirs.push(dir);
    return dir;
  }

  it("given_two_sessions__when_sorting_by_tokens__then_highest_tokens_first", async () => {
    const root = await makeDataRoot();
    const project = path.join(root, "demo");
    await mkdir(project, { recursive: true });

    const smallId = "00000000-0000-0000-0000-000000000001";
    const largeId = "00000000-0000-0000-0000-000000000002";
    await writeFile(
      path.join(project, `${smallId}.jsonl`),
      JSON.stringify(
        assistantLine({
          sessionId: smallId,
          timestamp: "2026-04-10T09:00:00.000Z",
          cwd: "/repo/demo",
          inputTokens: 10,
          outputTokens: 20,
        })
      ),
      "utf8"
    );
    await writeFile(
      path.join(project, `${largeId}.jsonl`),
      JSON.stringify(
        assistantLine({
          sessionId: largeId,
          timestamp: "2026-04-10T10:00:00.000Z",
          cwd: "/repo/demo",
          inputTokens: 500,
          outputTokens: 700,
        })
      ),
      "utf8"
    );
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runSessionsTop(["--limit=5"]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      sessions: readonly {
        sessionId: string;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        turns?: unknown;
      }[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.sessions.length).toBe(2);
    expect(parsed.sessions[0]?.sessionId).toBe(largeId);
    expect(parsed.sessions[0]?.totalTokens).toBe(1200);
    // Top command explicitly excludes the heavy turns array.
    expect(parsed.sessions[0]).not.toHaveProperty("turns");
  });

  it("given_unknown_sort_flag__when_running__then_exit_code_is_two", async () => {
    const root = await makeDataRoot();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const { exitCode } = await captureOutput(async () => {
      try {
        return await runSessionsTop(["--by=bogus"]);
      } catch {
        // runSessionsTop throws UsageError; the dispatcher maps that to 2.
        return 2;
      }
    });
    expect(exitCode).toBe(2);
  });
});

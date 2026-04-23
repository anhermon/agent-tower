import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLAUDE_DATA_ROOT_ENV } from "@control-plane/adapter-claude-code";

import { captureOutput } from "../test-helpers.js";

import { runSessionsShow } from "./sessions-show.js";

describe("runSessionsShow", () => {
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

  it("given_missing_session__when_showing__then_exit_one_and_not_found", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-show-"));
    tempDirs.push(root);
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runSessionsShow(["does-not-exist"]));
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout) as { ok: boolean; reason?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("not_found");
  });

  it("given_seeded_session__when_timeline_flag__then_payload_includes_timeline_and_attribution", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-show-tl-"));
    tempDirs.push(root);
    const project = path.join(root, "proj");
    await mkdir(project, { recursive: true });

    const sessionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const lines = [
      {
        type: "assistant" as const,
        sessionId,
        uuid: "turn-a",
        timestamp: "2026-04-10T10:00:00.000Z",
        cwd: "/repo/p",
        message: {
          role: "assistant" as const,
          model: "claude-sonnet-4-5",
          content: [
            { type: "tool_use" as const, id: "t1", name: "Skill", input: { skill: "testing" } },
          ],
          usage: {
            input_tokens: 5,
            output_tokens: 2,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 20,
          },
        },
      },
    ];
    await writeFile(
      path.join(project, `${sessionId}.jsonl`),
      lines.map((l) => JSON.stringify(l)).join("\n"),
      "utf8"
    );
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() =>
      runSessionsShow([sessionId, "--timeline"])
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      session: {
        sessionId: string;
        timeline?: { entries: { turnIndex: number; toolsUsed: string[] }[] };
        skillAttribution?: {
          entries: { turnIndex: number; skillsActivatedOnThisTurn: string[] }[];
        };
      };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.session.timeline?.entries[0]?.toolsUsed).toEqual(["Skill"]);
    expect(parsed.session.skillAttribution?.entries[0]?.skillsActivatedOnThisTurn).toEqual([
      "testing",
    ]);
  });

  it("given_seeded_session__when_showing_json__then_payload_excludes_turns", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-show-hit-"));
    tempDirs.push(root);
    const project = path.join(root, "proj");
    await mkdir(project, { recursive: true });

    const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const assistant = {
      type: "assistant" as const,
      sessionId,
      timestamp: "2026-04-10T10:00:00.000Z",
      cwd: "/repo/p",
      message: {
        role: "assistant" as const,
        model: "claude-sonnet-4-5",
        content: [{ type: "text" as const, text: "ok" }],
        usage: {
          input_tokens: 3,
          output_tokens: 4,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    };
    await writeFile(path.join(project, `${sessionId}.jsonl`), JSON.stringify(assistant), "utf8");
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const { exitCode, stdout } = await captureOutput(() => runSessionsShow([sessionId]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      session: { sessionId: string; turns?: unknown };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.session.sessionId).toBe(sessionId);
    expect(parsed.session).not.toHaveProperty("turns");
  });
});

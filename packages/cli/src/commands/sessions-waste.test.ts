import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLAUDE_DATA_ROOT_ENV } from "@control-plane/adapter-claude-code";

import { captureOutput } from "../test-helpers.js";

import { runSessionsWaste } from "./sessions-waste.js";

/**
 * Seed a JSONL session where the usage row has heavy cache_creation but no
 * cache_read — this saturates cacheThrashRatio (1.0) and drives a non-zero
 * overall waste score (~0.25, the cacheThrash weight).
 */
function thrashySession(sessionId: string): string {
  const line = {
    type: "assistant",
    sessionId,
    timestamp: "2026-04-10T10:00:00.000Z",
    cwd: "/repo/demo",
    message: {
      role: "assistant",
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text: "hi" }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 5000,
      },
    },
  };
  return JSON.stringify(line);
}

/** A clean session — tiny, no cache creation, no tools. Should score ~0. */
function cleanSession(sessionId: string): string {
  const line = {
    type: "assistant",
    sessionId,
    timestamp: "2026-04-10T09:00:00.000Z",
    cwd: "/repo/demo",
    message: {
      role: "assistant",
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text: "hi" }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 0,
      },
    },
  };
  return JSON.stringify(line);
}

describe("runSessionsWaste", () => {
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

  it("given_mixed_sessions__when_min_score_is_high__then_filtered_out", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "control-plane-cli-sessions-waste-"));
    tempDirs.push(root);
    const project = path.join(root, "demo");
    await mkdir(project, { recursive: true });

    const dirtyId = "00000000-0000-0000-0000-00000000dddd";
    const cleanId = "00000000-0000-0000-0000-00000000cccc";
    await writeFile(path.join(project, `${dirtyId}.jsonl`), thrashySession(dirtyId), "utf8");
    await writeFile(path.join(project, `${cleanId}.jsonl`), cleanSession(cleanId), "utf8");
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    // Low threshold: the thrashy session passes, the clean one doesn't.
    const low = await captureOutput(() => runSessionsWaste(["--limit=10", "--min-score=0.1"]));
    expect(low.exitCode).toBe(0);
    const lowParsed = JSON.parse(low.stdout) as {
      ok: boolean;
      results: readonly { sessionId: string; overall: number }[];
      meta: { total: number; minScore: number };
    };
    expect(lowParsed.ok).toBe(true);
    expect(lowParsed.meta.minScore).toBeCloseTo(0.1, 5);
    expect(lowParsed.meta.total).toBe(2);
    expect(lowParsed.results.length).toBe(1);
    expect(lowParsed.results[0]?.sessionId).toBe(dirtyId);

    // High threshold: both are below 0.8, so nothing passes.
    const high = await captureOutput(() => runSessionsWaste(["--limit=10", "--min-score=0.8"]));
    expect(high.exitCode).toBe(0);
    const highParsed = JSON.parse(high.stdout) as {
      results: readonly unknown[];
    };
    expect(highParsed.results).toEqual([]);
  });
});

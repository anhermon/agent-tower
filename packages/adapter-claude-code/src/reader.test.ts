import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listSessionFiles, readTranscriptFile } from "./reader.js";
import { ClaudeCodeSessionSource } from "./adapter.js";

let workdir: string;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "claude-adapter-test-"));
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("reader.listSessionFiles", () => {
  it("given_an_empty_or_missing_directory__when_listing__then_it_returns_empty", async () => {
    const missing = await listSessionFiles({ directory: path.join(workdir, "does-not-exist") });
    expect(missing).toEqual([]);

    await mkdir(workdir, { recursive: true });
    const empty = await listSessionFiles({ directory: workdir });
    expect(empty).toEqual([]);
  });

  it("given_project_folders_with_jsonl_files__when_listing__then_results_are_sorted_newest_first", async () => {
    const projectA = path.join(workdir, "-project-one");
    const projectB = path.join(workdir, "-project-two");
    await mkdir(projectA, { recursive: true });
    await mkdir(projectB, { recursive: true });

    await writeFile(path.join(projectA, "session-a.jsonl"), "\n", "utf8");
    await writeFile(path.join(projectB, "session-b.jsonl"), "\n", "utf8");
    await writeFile(path.join(projectA, "ignored.txt"), "noise", "utf8");

    const sessions = await listSessionFiles({ directory: workdir });
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual(["session-a", "session-b"]);
  });
});

describe("reader.readTranscriptFile", () => {
  it("given_a_jsonl_file_with_mixed_lines__when_reading__then_valid_entries_are_returned_and_malformed_reported", async () => {
    const filePath = path.join(workdir, "transcript.jsonl");
    const lines = [
      JSON.stringify({ type: "user", sessionId: "s1", message: { role: "user", content: "hi" } }),
      "", // blank
      "{not json}",
      JSON.stringify({ type: "assistant", sessionId: "s1", message: { role: "assistant", content: "hello" } })
    ];
    await writeFile(filePath, lines.join("\n"), "utf8");

    const result = await readTranscriptFile(filePath);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.type).toBe("user");
    expect(result.entries[1]?.type).toBe("assistant");
    expect(result.malformedLines).toEqual([3]);
  });
});

describe("ClaudeCodeSessionSource", () => {
  it("given_a_transcript_on_disk__when_loading_by_session_id__then_it_normalizes_end_to_end", async () => {
    const project = path.join(workdir, "-test-project");
    await mkdir(project, { recursive: true });
    const sessionId = "11111111-1111-1111-1111-111111111111";
    const filePath = path.join(project, `${sessionId}.jsonl`);

    const entries = [
      {
        type: "user",
        uuid: "u1",
        sessionId,
        timestamp: "2026-01-01T00:00:00.000Z",
        cwd: "/tmp/project",
        version: "2.1.97",
        message: { role: "user", content: "Explain this" }
      },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        sessionId,
        timestamp: "2026-01-01T00:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "Sure." }]
        }
      }
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n"), "utf8");

    const source = new ClaudeCodeSessionSource({ directory: workdir });
    const listed = await source.listSessions();
    expect(listed.map((s) => s.sessionId)).toEqual([sessionId]);

    const loaded = await source.loadSession(sessionId);
    expect(loaded).toBeDefined();
    expect(loaded?.session.id).toBe(sessionId);
    expect(loaded?.turns).toHaveLength(2);

    const batches: unknown[] = [];
    for await (const batch of source.stream()) {
      batches.push(batch);
    }
    expect(batches).toHaveLength(1);
  });
});

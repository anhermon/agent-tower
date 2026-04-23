import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __clearSearchCacheForTests } from "./cache";
import { GET } from "./route";

/**
 * Unit-level tests against the GET handler directly. A temp directory stands in
 * for the Claude data root via the `CLAUDE_CONTROL_PLANE_DATA_ROOT` env var —
 * no real `~/.claude/projects` access is made.
 */

function seedFixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "wave5-search-fixture-"));
  // `listSessionFiles` expects `<root>/<projectDir>/<sessionId>.jsonl`.
  const projectDir = path.join(root, "-Users-w5-sample");
  mkdirSync(projectDir, { recursive: true });
  const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const entries = [
    {
      type: "user",
      uuid: "u-1",
      sessionId,
      timestamp: "2026-04-23T00:00:00.000Z",
      message: { role: "user", content: "how do I deploy the mempalace?" },
    },
    {
      type: "assistant",
      uuid: "a-1",
      sessionId,
      timestamp: "2026-04-23T00:00:01.000Z",
      message: {
        role: "assistant",
        model: "claude-test",
        content: [{ type: "text", text: "mempalace ships via pnpm and a local taskfile" }],
        usage: { input_tokens: 10, output_tokens: 20 },
      },
    },
    {
      type: "user",
      uuid: "u-2",
      sessionId,
      timestamp: "2026-04-23T00:00:02.000Z",
      message: { role: "user", content: "thanks — noise line with no keyword" },
    },
  ];
  writeFileSync(
    path.join(projectDir, `${sessionId}.jsonl`),
    entries.map((e) => JSON.stringify(e)).join("\n"),
    "utf8"
  );
  return root;
}

async function requestSearch(
  root: string,
  params: URLSearchParams,
  init?: RequestInit
): Promise<Response> {
  const url = `http://127.0.0.1:3000/api/sessions/search?${params.toString()}`;
  process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT = root;
  return GET(new Request(url, init));
}

describe("GET /api/sessions/search — input validation", () => {
  const originalEnv = process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT;

  beforeEach(() => {
    __clearSearchCacheForTests();
  });
  afterEach(() => {
    process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT = originalEnv;
  });

  it("given_missing_query__when_searching__then_400", async () => {
    const root = seedFixtureRoot();
    const res = await requestSearch(root, new URLSearchParams());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/required/i);
  });

  it("given_path_traversal_in_q__when_searching__then_400", async () => {
    const root = seedFixtureRoot();
    const res = await requestSearch(root, new URLSearchParams({ q: "../etc/passwd" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/forbidden/i);
  });

  it("given_path_slash_in_q__when_searching__then_400", async () => {
    const root = seedFixtureRoot();
    const res = await requestSearch(root, new URLSearchParams({ q: "foo/bar" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/sessions/search — matching", () => {
  const originalEnv = process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT;

  beforeEach(() => {
    __clearSearchCacheForTests();
  });
  afterEach(() => {
    process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT = originalEnv;
  });

  it("given_keyword_present__when_searching__then_returns_hit", async () => {
    const root = seedFixtureRoot();
    const res = await requestSearch(root, new URLSearchParams({ q: "mempalace" }));
    expect(res.status).toBe(200);
    const hits = (await res.json()) as {
      sessionId: string;
      turnId: string;
      snippet: string;
      score: number;
      projectSlug: string;
    }[];
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].snippet.toLowerCase()).toContain("mempalace");
    expect(hits[0].sessionId).toMatch(/aaaaaaaa-/);
    expect(hits[0].projectSlug).toBe("-Users-w5-sample");
  });

  it("given_unmatched_query__when_searching__then_empty_array", async () => {
    const root = seedFixtureRoot();
    const res = await requestSearch(root, new URLSearchParams({ q: "nonexistentkeyword" }));
    expect(res.status).toBe(200);
    const hits = await res.json();
    expect(hits).toEqual([]);
  });

  it("given_abort_signal__when_searching__then_499", async () => {
    const root = seedFixtureRoot();
    const controller = new AbortController();
    controller.abort();
    const res = await requestSearch(root, new URLSearchParams({ q: "mempalace" }), {
      signal: controller.signal,
    });
    expect(res.status).toBe(499);
  });

  it("given_unchanged_file_mtime__when_searching_twice__then_second_call_reuses_cache", async () => {
    const root = seedFixtureRoot();
    // Normalize mtime to a fixed past timestamp so cache key is deterministic.
    const projectDir = path.join(root, "-Users-w5-sample");
    const jsonlPath = path.join(projectDir, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl");
    const fixedTime = new Date("2026-04-22T12:00:00Z");
    utimesSync(jsonlPath, fixedTime, fixedTime);

    const first = await requestSearch(root, new URLSearchParams({ q: "mempalace" }));
    expect(first.status).toBe(200);
    const firstHits = await first.json();

    // Second call at the same mtime — result must be identical. We can't
    // easily assert "no file reads happened" without intercepting fs, so we
    // assert observable-equivalence: the exact same hit list, same order.
    utimesSync(jsonlPath, fixedTime, fixedTime);
    const second = await requestSearch(root, new URLSearchParams({ q: "mempalace" }));
    expect(second.status).toBe(200);
    const secondHits = await second.json();
    expect(secondHits).toEqual(firstHits);
  });
});

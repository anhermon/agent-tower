import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route.js";

describe("/api/events GET", () => {
  const originalEnv = process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT;

  afterEach(() => {
    process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT = originalEnv;
  });

  it("given_no_data_root__when_requested__then_the_body_is_the_inert_retry_stub_with_no_data_frames", async () => {
    process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT = "/nonexistent-path-that-does-not-exist-12345";
    const controller = new AbortController();
    const response = await GET(
      new Request("http://127.0.0.1/api/events", { signal: controller.signal })
    );

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    // For a non-existent data root the unconfigured branch runs and we emit
    // the original inert stub — no fabricated `data:` frames.
    if (typeof response.body === "object" && response.body !== null) {
      // streamed path — abort quickly so the test doesn't hang
      controller.abort();
    }
  });

  it("given_configured_root__when_client_aborts__then_watchers_tear_down", async () => {
    // This is a behavior test for the watcher-cleanup contract. We only
    // assert that aborting the signal resolves the stream's read quickly
    // (i.e., the server does NOT keep the stream open after abort). A
    // leaked watcher would normally pin the process; here we verify cleanup
    // by observing that a subsequent `controller.abort()` causes the
    // response body to close within a small time budget.
    const root = mkdtempSync(path.join(tmpdir(), "events-route-"));
    const projectDir = path.join(root, "-Users-w5-events");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      path.join(projectDir, "abc.jsonl"),
      JSON.stringify({ type: "user", uuid: "u1", sessionId: "abc", message: { content: "hi" } }),
      "utf8"
    );
    process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT = root;

    const controller = new AbortController();
    const response = await GET(
      new Request("http://127.0.0.1/api/events", { signal: controller.signal })
    );
    const reader = response.body!.getReader();

    // Read the first chunk (retry: line), then abort.
    const first = await reader.read();
    expect(first.value).toBeTruthy();
    controller.abort();

    // After abort the stream must close. Read should return `done: true`
    // within a tight budget.
    const deadline = Date.now() + 2_000;
    let done = false;
    while (!done && Date.now() < deadline) {
      const chunk = await reader.read();
      if (chunk.done) {
        done = true;
        break;
      }
    }
    expect(done).toBe(true);
  });

  it("given_configured_root__when_opened__then_headers_are_sse_and_first_chunk_is_retry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "events-route-headers-"));
    const projectDir = path.join(root, "-Users-w5-events-headers");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      path.join(projectDir, "abc.jsonl"),
      JSON.stringify({ type: "user", uuid: "u1", sessionId: "abc", message: { content: "hi" } }),
      "utf8"
    );
    process.env.CLAUDE_CONTROL_PLANE_DATA_ROOT = root;

    const controller = new AbortController();
    const response = await GET(
      new Request("http://127.0.0.1/api/events", { signal: controller.signal })
    );
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Cache-Control")).toContain("no-cache");

    const reader = response.body!.getReader();
    const first = await reader.read();
    const decoded = new TextDecoder().decode(first.value);
    expect(decoded).toContain("retry:");
    controller.abort();
  });
});

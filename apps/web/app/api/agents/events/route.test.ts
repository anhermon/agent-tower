import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route.js";

const DATA_ROOT_ENV = "CLAUDE_CONTROL_PLANE_DATA_ROOT";
const PROJECT_ID = "-Users-agent-events";
const SESSION_ID = "22222222-3333-4444-5555-666666666666";

describe("/api/agents/events GET", () => {
  const originalEnv = process.env[DATA_ROOT_ENV];
  const roots: string[] = [];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[DATA_ROOT_ENV];
    } else {
      process.env[DATA_ROOT_ENV] = originalEnv;
    }
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("given_unconfigured_data_root__when_requested__then_returns_inert_retry_comment_stream", async () => {
    process.env[DATA_ROOT_ENV] = "/nonexistent-agent-events-root";
    const response = await GET(new Request("http://127.0.0.1/api/agents/events"));

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("retry:");
    expect(body).toContain(": no agent events");
    expect(body).not.toContain("data:");
  });

  it("given_configured_root_with_transcript__when_opened__then_emits_valid_animation_snapshot", async () => {
    const root = seedRoot([
      {
        type: "assistant",
        sessionId: SESSION_ID,
        uuid: "assistant-1",
        timestamp: "2026-04-23T10:00:00.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Working." }],
        },
      },
    ]);
    process.env[DATA_ROOT_ENV] = root;

    const controller = new AbortController();
    const response = await GET(
      new Request("http://127.0.0.1/api/agents/events", { signal: controller.signal })
    );
    const data = await readFirstDataFrame(response);
    controller.abort();

    expect(data.snapshot).toMatchObject({
      agentId: `claude-code:${PROJECT_ID}`,
      projectId: PROJECT_ID,
      baseState: "working",
      overlay: "none",
      activeSessionIds: [SESSION_ID],
    });
  });

  it("given_configured_root__when_client_aborts__then_stream_closes", async () => {
    const root = seedRoot([
      {
        type: "assistant",
        sessionId: SESSION_ID,
        uuid: "assistant-1",
        timestamp: "2026-04-23T10:00:00.000Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "tool-1", name: "Bash", input: {} }],
        },
      },
    ]);
    process.env[DATA_ROOT_ENV] = root;

    const controller = new AbortController();
    const response = await GET(
      new Request("http://127.0.0.1/api/agents/events", { signal: controller.signal })
    );
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.value).toBeTruthy();

    controller.abort();

    const deadline = Date.now() + 2_000;
    let done = false;
    while (!done && Date.now() < deadline) {
      const chunk = await reader.read();
      if (chunk.done) done = true;
    }
    expect(done).toBe(true);
  });

  it("given_malformed_jsonl_line__when_streaming__then_valid_lines_still_emit_snapshots", async () => {
    const root = seedRoot(
      [
        {
          type: "assistant",
          sessionId: SESSION_ID,
          uuid: "assistant-1",
          timestamp: "2026-04-23T10:00:00.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Recovered." }],
          },
        },
      ],
      { malformedPrefix: true }
    );
    process.env[DATA_ROOT_ENV] = root;

    const controller = new AbortController();
    const response = await GET(
      new Request("http://127.0.0.1/api/agents/events", { signal: controller.signal })
    );
    const data = await readFirstDataFrame(response);
    controller.abort();

    expect(data.snapshot.baseState).toBe("working");
    expect(data.snapshot.projectId).toBe(PROJECT_ID);
  });

  function seedRoot(
    entries: readonly Record<string, unknown>[],
    options: { readonly malformedPrefix?: boolean } = {}
  ): string {
    const root = mkdtempSync(path.join(tmpdir(), "agent-events-route-"));
    roots.push(root);
    const projectDir = path.join(root, PROJECT_ID);
    mkdirSync(projectDir, { recursive: true });
    const lines = entries.map((entry) => JSON.stringify(entry));
    if (options.malformedPrefix) lines.unshift("{not-json");
    writeFileSync(path.join(projectDir, `${SESSION_ID}.jsonl`), `${lines.join("\n")}\n`, "utf8");
    return root;
  }
});

async function readFirstDataFrame(response: Response): Promise<{
  readonly snapshot: Record<string, unknown>;
}> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffered += decoder.decode(chunk.value, { stream: true });
    const frame = buffered
      .split("\n\n")
      .map((part) => part.trim())
      .find((part) => part.startsWith("data:"));
    if (!frame) continue;
    return JSON.parse(frame.slice("data:".length).trim()) as { snapshot: Record<string, unknown> };
  }

  throw new Error(`No data frame received. Buffered: ${buffered}`);
}

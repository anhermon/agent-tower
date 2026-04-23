import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as Os from "node:os";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof Os>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

const { CLAUDE_DATA_ROOT_ENV } = await import("@control-plane/adapter-claude-code");
const { sessionsTopTool } = await import("./sessions-top.js");

interface AssistantLine {
  readonly type: "assistant";
  readonly timestamp: string;
  readonly sessionId: string;
  readonly cwd: string;
  readonly message: {
    readonly role: "assistant";
    readonly model: string;
    readonly usage: {
      readonly input_tokens: number;
      readonly output_tokens: number;
      readonly cache_read_input_tokens?: number;
      readonly cache_creation_input_tokens?: number;
    };
    readonly content: readonly { readonly type: "text"; readonly text: string }[];
  };
}

function assistantLine(opts: {
  readonly sessionId: string;
  readonly cwd: string;
  readonly timestamp: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model?: string;
}): AssistantLine {
  return {
    type: "assistant",
    timestamp: opts.timestamp,
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    message: {
      role: "assistant",
      model: opts.model ?? "claude-sonnet-4-5",
      usage: {
        input_tokens: opts.inputTokens,
        output_tokens: opts.outputTokens,
      },
      content: [{ type: "text", text: "hello" }],
    },
  };
}

async function makeJsonl(
  root: string,
  projectId: string,
  sessionId: string,
  lines: readonly unknown[]
): Promise<void> {
  const projectDir = path.join(root, projectId);
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, `${sessionId}.jsonl`),
    lines.map((line) => JSON.stringify(line)).join("\n"),
    "utf8"
  );
}

describe("sessions_top tool", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-top-home-"));
    tempDirs.push(sandbox);
    mockedHome = sandbox;
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env[CLAUDE_DATA_ROOT_ENV];
    else process.env[CLAUDE_DATA_ROOT_ENV] = originalEnv;
    mockedHome = null;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("returns unconfigured when no data root is resolvable", async () => {
    const result = await sessionsTopTool.handler({});
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("ranks sessions by tokens and respects the limit", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-top-data-"));
    tempDirs.push(root);

    // small: 10 in, 10 out = 20 tokens
    await makeJsonl(root, "proj-a", "small-session", [
      assistantLine({
        sessionId: "small-session",
        cwd: "/repo/a",
        timestamp: "2026-04-10T10:00:00.000Z",
        inputTokens: 10,
        outputTokens: 10,
      }),
    ]);
    // medium: 100 + 100 = 200
    await makeJsonl(root, "proj-a", "medium-session", [
      assistantLine({
        sessionId: "medium-session",
        cwd: "/repo/a",
        timestamp: "2026-04-10T11:00:00.000Z",
        inputTokens: 100,
        outputTokens: 100,
      }),
    ]);
    // large: 1000 + 1000 = 2000
    await makeJsonl(root, "proj-a", "large-session", [
      assistantLine({
        sessionId: "large-session",
        cwd: "/repo/a",
        timestamp: "2026-04-10T12:00:00.000Z",
        inputTokens: 1000,
        outputTokens: 1000,
      }),
    ]);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await sessionsTopTool.handler({ limit: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sessions = result.sessions as readonly { sessionId: string }[];
    expect(sessions.map((s) => s.sessionId)).toEqual(["large-session", "medium-session"]);
    expect(result.by).toBe("tokens");
    expect(result.limit).toBe(2);
    expect(result.total).toBe(3);
  });

  it("filters by projectId", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-top-proj-"));
    tempDirs.push(root);
    await makeJsonl(root, "-repo-a", "s-one", [
      assistantLine({
        sessionId: "s-one",
        cwd: "-repo-a",
        timestamp: "2026-04-10T10:00:00.000Z",
        inputTokens: 100,
        outputTokens: 100,
      }),
    ]);
    await makeJsonl(root, "-repo-b", "s-two", [
      assistantLine({
        sessionId: "s-two",
        cwd: "-repo-b",
        timestamp: "2026-04-10T10:00:00.000Z",
        inputTokens: 500,
        outputTokens: 500,
      }),
    ]);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await sessionsTopTool.handler({ projectId: "-repo-a" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sessions = result.sessions as readonly { sessionId: string }[];
    expect(sessions.map((s) => s.sessionId)).toEqual(["s-one"]);
  });
});

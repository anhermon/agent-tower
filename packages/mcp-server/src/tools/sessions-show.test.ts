import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof os>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

const { CLAUDE_DATA_ROOT_ENV } = await import("@control-plane/adapter-claude-code");
const { sessionsShowTool } = await import("./sessions-show.js");

function assistantLine(opts: {
  readonly sessionId: string;
  readonly cwd: string;
  readonly timestamp: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}): Record<string, unknown> {
  return {
    type: "assistant",
    timestamp: opts.timestamp,
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    message: {
      role: "assistant",
      model: "claude-sonnet-4-5",
      usage: {
        input_tokens: opts.inputTokens,
        output_tokens: opts.outputTokens,
      },
      content: [{ type: "text", text: "ok" }],
    },
  };
}

describe("sessions_show tool", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-show-home-"));
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

  it("rejects missing sessionId with invalid_input", async () => {
    const result = await sessionsShowTool.handler({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_input");
  });

  it("returns unconfigured when no data root is resolvable", async () => {
    const result = await sessionsShowTool.handler({ sessionId: "does-not-matter" });
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("returns not_found for an unknown session id", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-show-data-"));
    tempDirs.push(root);
    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await sessionsShowTool.handler({ sessionId: "never-existed" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_found");
  });

  it("includes timeline and skillAttribution when includeTimeline=true", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-show-tl-"));
    tempDirs.push(root);
    const project = path.join(root, "proj-tl");
    await mkdir(project, { recursive: true });

    const sessionId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const lines: Record<string, unknown>[] = [
      {
        type: "assistant",
        sessionId,
        uuid: "u-1",
        timestamp: "2026-04-10T12:00:00.000Z",
        cwd: "/repo/tl",
        message: {
          role: "assistant",
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 10, output_tokens: 4 },
          content: [{ type: "tool_use", id: "t1", name: "Skill", input: { skill: "commit" } }],
        },
      },
    ];
    await writeFile(
      path.join(project, `${sessionId}.jsonl`),
      lines.map((l) => JSON.stringify(l)).join("\n"),
      "utf8"
    );
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await sessionsShowTool.handler({ sessionId, includeTimeline: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeTimeline).toBe(true);
    const session = result.session as Record<string, unknown>;
    const timeline = session.timeline as { entries: { toolsUsed: string[] }[] };
    expect(timeline.entries[0]?.toolsUsed).toEqual(["Skill"]);
    const attribution = session.skillAttribution as {
      entries: { skillsActivatedOnThisTurn: string[] }[];
    };
    expect(attribution.entries[0]?.skillsActivatedOnThisTurn).toEqual(["commit"]);
  });

  it("returns the session summary without turns by default", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-show-session-"));
    tempDirs.push(root);
    const project = path.join(root, "proj-show");
    await mkdir(project, { recursive: true });

    const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const lines = [
      assistantLine({
        sessionId,
        cwd: "/repo/show",
        timestamp: "2026-04-10T12:00:00.000Z",
        inputTokens: 200,
        outputTokens: 50,
      }),
    ];
    await writeFile(
      path.join(project, `${sessionId}.jsonl`),
      lines.map((line) => JSON.stringify(line)).join("\n"),
      "utf8"
    );
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await sessionsShowTool.handler({ sessionId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionId).toBe(sessionId);
    expect(result.includeTurns).toBe(false);
    const session = result.session as Record<string, unknown>;
    expect(session.sessionId).toBe(sessionId);
    expect(session).not.toHaveProperty("turns");
  });
});

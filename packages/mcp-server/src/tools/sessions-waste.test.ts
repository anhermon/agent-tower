import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

const { CLAUDE_DATA_ROOT_ENV } = await import("@control-plane/adapter-claude-code");
const { sessionsWasteTool } = await import("./sessions-waste.js");

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
      readonly cache_creation_input_tokens?: number;
      readonly cache_read_input_tokens?: number;
    };
    readonly content: readonly unknown[];
  };
}

function thrashyAssistantLine(opts: {
  readonly sessionId: string;
  readonly cwd: string;
  readonly timestamp: string;
  readonly cacheCreation: number;
  readonly cacheRead: number;
  readonly toolUseBlocks: readonly { name: string; id: string }[];
}): AssistantLine {
  return {
    type: "assistant",
    timestamp: opts.timestamp,
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    message: {
      role: "assistant",
      model: "claude-sonnet-4-5",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: opts.cacheCreation,
        cache_read_input_tokens: opts.cacheRead,
      },
      content: opts.toolUseBlocks.map((b) => ({
        type: "tool_use",
        id: b.id,
        name: b.name,
        input: {},
      })),
    },
  };
}

async function writeSession(
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

/** Produces a single-tool-turn assistant line for sequential-tool hammering. */
function manyThrashyTurns(
  sessionId: string,
  cwd: string,
  startIso: string,
  count: number
): AssistantLine[] {
  const startMs = new Date(startIso).getTime();
  const lines: AssistantLine[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(
      thrashyAssistantLine({
        sessionId,
        cwd,
        timestamp: new Date(startMs + i * 1000).toISOString(),
        // Heavy cache creation, light read → thrash ratio ≈ 0.9
        cacheCreation: 9000,
        cacheRead: 1000,
        // Single tool_use block per turn → 100% sequential
        toolUseBlocks: [{ name: "Bash", id: `tool-${i}` }],
      })
    );
  }
  return lines;
}

describe("sessions_waste tool", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-waste-home-"));
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
    const result = await sessionsWasteTool.handler({});
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("ranks by overall waste desc and filters by minScore", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-waste-data-"));
    tempDirs.push(root);

    // Pathological session: 5 single-tool turns with heavy cache thrash.
    await writeSession(
      root,
      "proj-a",
      "bad-session",
      manyThrashyTurns("bad-session", "/repo/a", "2026-04-10T10:00:00.000Z", 5)
    );

    // Clean session: one assistant turn, balanced cache, no tool use.
    await writeSession(root, "proj-a", "clean-session", [
      {
        type: "assistant",
        timestamp: "2026-04-10T11:00:00.000Z",
        sessionId: "clean-session",
        cwd: "/repo/a",
        message: {
          role: "assistant",
          model: "claude-sonnet-4-5",
          usage: {
            input_tokens: 10,
            output_tokens: 10,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 9000,
          },
          content: [{ type: "text", text: "hello" }],
        },
      },
    ]);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    // Low minScore: we expect the bad session to rank first, clean filtered out.
    const result = await sessionsWasteTool.handler({ limit: 5, minScore: 0.1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const results = result.results as readonly { sessionId: string; overall: number }[];
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.sessionId).toBe("bad-session");
    // Sorted desc
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.overall).toBeGreaterThanOrEqual(results[i]!.overall);
    }
    // All above minScore
    for (const r of results) expect(r.overall).toBeGreaterThanOrEqual(0.1);

    // High minScore filters everything out.
    const filtered = await sessionsWasteTool.handler({ minScore: 0.99 });
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect((filtered.results as readonly unknown[]).length).toBe(0);
  });
});

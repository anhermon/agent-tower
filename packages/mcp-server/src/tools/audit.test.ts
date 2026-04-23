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

const {
  CLAUDE_DATA_ROOT_ENV,
  SKILLS_ROOTS_ENV,
  __clearSkillsCacheForTests,
  __clearSkillsEfficacyCacheForTests,
  __clearSkillsUsageCacheForTests,
} = await import("@control-plane/adapter-claude-code");
const { controlPlaneAuditTool } = await import("./audit.js");

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

function assistantLine(opts: {
  readonly sessionId: string;
  readonly cwd: string;
  readonly timestamp: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreation?: number;
  readonly cacheRead?: number;
  readonly toolUseBlocks?: readonly { name: string; id: string }[];
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
        input_tokens: opts.inputTokens,
        output_tokens: opts.outputTokens,
        cache_creation_input_tokens: opts.cacheCreation ?? 0,
        cache_read_input_tokens: opts.cacheRead ?? 0,
      },
      content: opts.toolUseBlocks
        ? opts.toolUseBlocks.map((b) => ({
            type: "tool_use",
            id: b.id,
            name: b.name,
            input: {},
          }))
        : [{ type: "text", text: "hello" }],
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

describe("control_plane_audit tool", () => {
  const originalDataEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const originalSkillsEnv = process.env[SKILLS_ROOTS_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    delete process.env[SKILLS_ROOTS_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-audit-home-"));
    tempDirs.push(sandbox);
    mockedHome = sandbox;
    __clearSkillsCacheForTests();
    __clearSkillsEfficacyCacheForTests();
    __clearSkillsUsageCacheForTests();
  });

  afterEach(async () => {
    if (originalDataEnv === undefined) delete process.env[CLAUDE_DATA_ROOT_ENV];
    else process.env[CLAUDE_DATA_ROOT_ENV] = originalDataEnv;
    if (originalSkillsEnv === undefined) delete process.env[SKILLS_ROOTS_ENV];
    else process.env[SKILLS_ROOTS_ENV] = originalSkillsEnv;
    mockedHome = null;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("returns unconfigured when no data root is resolvable", async () => {
    const result = await controlPlaneAuditTool.handler({});
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("returns aggregates, topByCost, topByWaste, and skills sections", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-audit-data-"));
    tempDirs.push(root);

    // Big session: big token count, 1 tool.
    await writeSession(root, "proj-a", "session-big", [
      assistantLine({
        sessionId: "session-big",
        cwd: "/repo/a",
        timestamp: "2026-04-10T12:00:00.000Z",
        inputTokens: 10000,
        outputTokens: 5000,
        cacheCreation: 4000,
        cacheRead: 1000,
        toolUseBlocks: [{ name: "Bash", id: "t1" }],
      }),
    ]);

    // Small session, another project.
    await writeSession(root, "proj-b", "session-small", [
      assistantLine({
        sessionId: "session-small",
        cwd: "/repo/b",
        timestamp: "2026-04-10T13:00:00.000Z",
        inputTokens: 100,
        outputTokens: 50,
        cacheCreation: 50,
        cacheRead: 950,
      }),
    ]);

    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await controlPlaneAuditTool.handler({ limit: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.dataRoot).toBe(root);
    expect(result.sessionsScanned).toBe(2);
    expect(typeof result.totalEstimatedCostUsd).toBe("number");

    const topByCost = result.topByCost as readonly { sessionId: string; costUsd: number }[];
    expect(topByCost.length).toBeGreaterThan(0);
    // Desc order
    for (let i = 1; i < topByCost.length; i++) {
      expect(topByCost[i - 1]!.costUsd).toBeGreaterThanOrEqual(topByCost[i]!.costUsd);
    }

    const topByWaste = result.topByWaste as readonly {
      sessionId: string;
      overall: number;
      cwd: string;
      costUsd: number;
    }[];
    // Desc
    for (let i = 1; i < topByWaste.length; i++) {
      expect(topByWaste[i - 1]!.overall).toBeGreaterThanOrEqual(topByWaste[i]!.overall);
    }
    // Context merged in
    if (topByWaste.length > 0) {
      expect(topByWaste[0]!.cwd).toBeDefined();
      expect(typeof topByWaste[0]!.costUsd).toBe("number");
    }

    const aggregates = result.wasteAggregates as Record<string, number>;
    expect(aggregates).toBeDefined();
    expect(typeof aggregates.avgOverall).toBe("number");
    expect(typeof aggregates.avgCacheThrash).toBe("number");
    expect(typeof aggregates.avgSequentialTools).toBe("number");
    expect(typeof aggregates.avgToolPollution).toBe("number");
    expect(typeof aggregates.avgContextBloat).toBe("number");
    expect(typeof aggregates.bloatWithoutCompactionCount).toBe("number");
    expect(typeof aggregates.highWasteSessionCount).toBe("number");
    expect(aggregates.sessionsWithWasteSignals).toBe(2);

    expect(Array.isArray(result.skillsColdGiants)).toBe(true);
    expect(Array.isArray(result.skillsNegativeEfficacy)).toBe(true);

    const topProjects = result.topProjects as readonly { projectId: string; sessions: number }[];
    expect(topProjects.length).toBeGreaterThan(0);
    const projectIds = topProjects.map((p) => p.projectId);
    expect(projectIds).toContain("/repo/a");
    expect(projectIds).toContain("/repo/b");
  });
});

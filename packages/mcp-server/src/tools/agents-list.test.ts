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
const { agentsListTool } = await import("./agents-list.js");

describe("agents_list tool", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  const tempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-agents-home-"));
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
    const result = await agentsListTool.handler({});
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("groups sessions by projectId with stats", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cp-mcp-agents-data-"));
    tempDirs.push(root);

    const projectA = path.join(root, "proj-a");
    const projectB = path.join(root, "proj-b");
    await mkdir(projectA, { recursive: true });
    await mkdir(projectB, { recursive: true });

    await writeFile(path.join(projectA, "s-1.jsonl"), "line", "utf8");
    await writeFile(path.join(projectA, "s-2.jsonl"), "line", "utf8");
    await writeFile(path.join(projectB, "s-3.jsonl"), "line", "utf8");

    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await agentsListTool.handler({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agentCount).toBe(2);
    const agents = result.agents as readonly {
      agentId: string;
      projectId: string;
      sessionCount: number;
      firstSeenAt: string | null;
      lastActiveAt: string | null;
      totalBytes: number;
    }[];
    const byProject = new Map(agents.map((a) => [a.projectId, a]));
    const a = byProject.get("proj-a");
    const b = byProject.get("proj-b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.sessionCount).toBe(2);
    expect(a!.agentId).toBe("claude-code:proj-a");
    expect(b!.sessionCount).toBe(1);
    expect(a!.totalBytes).toBeGreaterThan(0);
    expect(a!.firstSeenAt).toBeTypeOf("string");
    expect(a!.lastActiveAt).toBeTypeOf("string");
  });
});

import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AGENT_STATUSES } from "@control-plane/core";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof os>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

const { __clearAgentInventoryCacheForTests, listAgentsOrEmpty, loadAgentOrUndefined, toAgentId } =
  await import("./agents-source");

const CLAUDE_DATA_ROOT_ENV = "CLAUDE_CONTROL_PLANE_DATA_ROOT";

describe("agents-source", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  let tempHome: string | null = null;
  let tempRoot: string | null = null;

  beforeEach(async () => {
    __clearAgentInventoryCacheForTests();
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    tempHome = await mkdtemp(path.join(os.tmpdir(), "agents-source-home-"));
    mockedHome = tempHome;
    tempRoot = null;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env[CLAUDE_DATA_ROOT_ENV];
    } else {
      process.env[CLAUDE_DATA_ROOT_ENV] = originalEnv;
    }
    mockedHome = null;
    if (tempHome) {
      await rm(tempHome, { recursive: true, force: true });
      tempHome = null;
    }
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it("given_no_env_var_and_no_fallback__when_listing__then_returns_unconfigured", async () => {
    const result = await listAgentsOrEmpty();
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("given_a_data_root_with_two_projects_each_with_transcripts__when_listing__then_returns_two_agents_with_correct_counts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    await seedTranscript(
      root,
      "-Users-alice-project-one",
      "session-a1",
      "2026-04-23T10:00:00.000Z"
    );
    await seedTranscript(
      root,
      "-Users-alice-project-one",
      "session-a2",
      "2026-04-23T11:00:00.000Z"
    );
    await seedTranscript(
      root,
      "-Users-alice-project-two",
      "session-b1",
      "2026-04-23T09:00:00.000Z"
    );

    const result = await listAgentsOrEmpty(new Date("2026-04-23T12:00:00.000Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents).toHaveLength(2);

    const byProject = Object.fromEntries(result.agents.map((agent) => [agent.projectId, agent]));

    const projectOne = byProject["-Users-alice-project-one"];
    expect(projectOne.sessionCount).toBe(2);
    expect(projectOne.descriptor.id).toBe(toAgentId("-Users-alice-project-one"));
    expect(projectOne.descriptor.runtime).toBe("claude");
    expect(projectOne.descriptor.kind).toBe("interactive");
    expect(projectOne.descriptor.displayName).toBe("/Users/alice/project/one");
    expect(projectOne.descriptor.metadata?.projectId).toBe("-Users-alice-project-one");

    const projectTwo = byProject["-Users-alice-project-two"];
    expect(projectTwo.sessionCount).toBe(1);
    expect(projectTwo.totalBytes).toBeGreaterThan(0);
  });

  it("given_a_recent_transcript__when_deriving_state__then_it_is_available", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const fresh = new Date(Date.now() - 5 * 60 * 1_000); // 5 minutes ago
    await seedTranscript(root, "-Users-fresh", "session-fresh", fresh.toISOString(), {
      mtime: fresh,
    });

    const result = await listAgentsOrEmpty(new Date());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents).toHaveLength(1);
    const [agent] = result.agents;
    expect(agent.state.status).toBe(AGENT_STATUSES.Available);
    expect(agent.state.activeSessionIds).toContain("session-fresh");
  });

  it("given_an_old_transcript__when_deriving_state__then_it_is_offline", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000); // 5 days ago
    await seedTranscript(root, "-Users-stale", "session-stale", old.toISOString(), {
      mtime: old,
    });

    const result = await listAgentsOrEmpty(new Date());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents).toHaveLength(1);
    const [agent] = result.agents;
    expect(agent.state.status).toBe(AGENT_STATUSES.Offline);
    expect(agent.state.activeSessionIds).toEqual([]);
  });

  it("given_unknown_agent_id__when_loading_agent__then_returns_not_found", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    await seedTranscript(root, "-Users-bob-app", "session-b1", "2026-04-23T10:00:00.000Z");

    const result = await loadAgentOrUndefined("claude-code:does-not-exist");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("given_known_agent_id__when_loading_agent__then_returns_agent_with_its_sessions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    await seedTranscript(root, "-Users-bob-app", "session-b1", "2026-04-23T10:00:00.000Z");
    await seedTranscript(root, "-Users-bob-app", "session-b2", "2026-04-23T11:00:00.000Z");

    const agentId = toAgentId("-Users-bob-app");
    const result = await loadAgentOrUndefined(agentId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.descriptor.id).toBe(agentId);
    expect(result.agent.sessionCount).toBe(2);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.map((session) => session.sessionId).sort()).toEqual([
      "session-b1",
      "session-b2",
    ]);
  });
});

async function seedTranscript(
  root: string,
  projectId: string,
  sessionId: string,
  timestamp: string,
  options: { readonly mtime?: Date } = {}
): Promise<void> {
  const projectDir = path.join(root, projectId);
  await mkdir(projectDir, { recursive: true });
  const entries = [
    {
      type: "user",
      sessionId,
      uuid: `${sessionId}-user`,
      timestamp,
      cwd: "/tmp/x",
      version: "1.0.0",
      message: { role: "user", content: "hello" },
    },
  ];
  const filePath = path.join(projectDir, `${sessionId}.jsonl`);
  await writeFile(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
  if (options.mtime) {
    await utimes(filePath, options.mtime, options.mtime);
  }
}

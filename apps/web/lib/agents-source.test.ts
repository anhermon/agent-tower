import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AGENT_STATUSES } from "@control-plane/core";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importActual<typeof import(...)> pattern requires inline import type
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

const {
  __clearAgentInventoryCacheForTests,
  humanizeProjectId,
  listAgentsOrEmpty,
  loadAgentOrUndefined,
  toAgentId,
} = await import("./agents-source");

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

  it("given_a_data_root_with_no_transcripts__when_listing__then_returns_empty_agents_list", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    // Create a project directory but no JSONL files inside it.
    await mkdir(path.join(root, "-Users-empty-project"), { recursive: true });

    const result = await listAgentsOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents).toHaveLength(0);
  });

  it("given_a_transcript_with_sessions__when_listing__then_state_lastSeenAt_is_set_to_newest_transcript_mtime", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const older = new Date("2026-04-22T10:00:00.000Z");
    const newer = new Date("2026-04-23T11:00:00.000Z");
    await seedTranscript(root, "-Users-charlie-app", "session-old", older.toISOString(), {
      mtime: older,
    });
    await seedTranscript(root, "-Users-charlie-app", "session-new", newer.toISOString(), {
      mtime: newer,
    });

    const result = await listAgentsOrEmpty(new Date("2026-04-23T12:00:00.000Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [agent] = result.agents;
    // lastSeenAt is set to the most recent transcript mtime
    expect(agent.state.lastSeenAt).toBe(newer.toISOString());
    expect(agent.lastActiveAt).toBe(newer.toISOString());
  });

  it("given_cached_listing__when_now_advances_past_one_day_threshold__then_status_ages_to_offline", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    // Transcript written at t0; first query at t1 (30 min later) → Available.
    // Second query at t2 (25 hours later, same file listing) → Offline.
    const t0 = new Date("2026-04-23T10:00:00.000Z");
    const t1 = new Date("2026-04-23T10:30:00.000Z");
    const t2 = new Date("2026-04-24T11:00:00.000Z");

    await seedTranscript(root, "-Users-aging", "session-aging", t0.toISOString(), { mtime: t0 });

    const result1 = await listAgentsOrEmpty(t1);
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;
    expect(result1.agents[0].state.status).toBe(AGENT_STATUSES.Available);

    // The file listing signature is identical (same file, same mtime), so the
    // cache is hit. State must be re-derived against `t2`.
    const result2 = await listAgentsOrEmpty(t2);
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.agents[0].state.status).toBe(AGENT_STATUSES.Offline);
  });

  it("given_transcript_mtime_exactly_one_hour_old__when_deriving_status__then_it_is_busy_not_available", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const ONE_HOUR_MS = 60 * 60 * 1_000;
    // Age is exactly ONE_HOUR_MS; deriveStatus uses strict `< ONE_HOUR_MS` for
    // Available, so the boundary value should land in Busy.
    const now = new Date("2026-04-23T12:00:00.000Z");
    const mtime = new Date(now.getTime() - ONE_HOUR_MS);
    await seedTranscript(root, "-Users-boundary", "session-boundary", mtime.toISOString(), {
      mtime,
    });

    const result = await listAgentsOrEmpty(now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents[0].state.status).toBe(AGENT_STATUSES.Busy);
  });

  it("given_transcript_with_future_mtime__when_deriving_status__then_it_is_offline_not_available", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agents-source-root-"));
    tempRoot = root;
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    // Clock-skew guard: a future mtime produces a negative age, which should
    // be treated as Offline rather than Available.
    const now = new Date("2026-04-23T12:00:00.000Z");
    const future = new Date(now.getTime() + 5 * 60 * 1_000);
    await seedTranscript(root, "-Users-future", "session-future", future.toISOString(), {
      mtime: future,
    });

    const result = await listAgentsOrEmpty(now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents[0].state.status).toBe(AGENT_STATUSES.Offline);
  });

  describe("humanizeProjectId", () => {
    it("decodes_leading_dash_as_root_slash", () => {
      expect(humanizeProjectId("-Users-alice-project")).toBe("/Users/alice/project");
    });

    it("decodes_doubled_dash_as_literal_hyphen", () => {
      expect(humanizeProjectId("-Users-alice-my--project")).toBe("/Users/alice/my-project");
    });

    it("handles_empty_string", () => {
      expect(humanizeProjectId("")).toBe("");
    });

    it("handles_no_leading_dash_path", () => {
      // No leading dash → no leading slash substitution, only `-` → `/` replacements.
      expect(humanizeProjectId("Users-alice")).toBe("Users/alice");
    });

    it("decodes_multiple_doubled_dashes", () => {
      expect(humanizeProjectId("-home-user-my--app--v2")).toBe("/home/user/my-app-v2");
    });
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

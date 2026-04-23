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

// Import under test AFTER the vi.mock call so that the module captures the
// mocked `homedir`.
const {
  CLAUDE_DATA_ROOT_ENV,
  getConfiguredAnalyticsSource,
  getConfiguredSessionSource,
  listProjectSummariesOrEmpty,
  listSessionsOrEmpty,
  loadSessionOrUndefined,
  loadSessionUsageOrEmpty,
  resolveDataRoot,
} = await import("./sessions-source");

describe("sessions-source", () => {
  const originalEnv = process.env[CLAUDE_DATA_ROOT_ENV];
  let tempDir: string | null = null;

  beforeEach(async () => {
    delete process.env[CLAUDE_DATA_ROOT_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "control-plane-home-"));
    tempDir = sandbox;
    mockedHome = sandbox;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env[CLAUDE_DATA_ROOT_ENV];
    } else {
      process.env[CLAUDE_DATA_ROOT_ENV] = originalEnv;
    }
    mockedHome = null;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("given_no_env_var_and_no_home_fallback__when_resolving__then_it_returns_null", () => {
    expect(resolveDataRoot()).toBeNull();
    expect(getConfiguredSessionSource()).toBeNull();
  });

  it("given_home_fallback_dir_exists__when_resolving__then_it_is_used_with_default_origin", async () => {
    const fakeProjects = path.join(tempDir!, ".claude", "projects");
    await mkdir(fakeProjects, { recursive: true });
    const resolved = resolveDataRoot();
    expect(resolved).toEqual({ directory: fakeProjects, origin: "default" });
  });

  it("given_env_var__when_resolving__then_env_wins_over_home_fallback", async () => {
    const fakeProjects = path.join(tempDir!, ".claude", "projects");
    await mkdir(fakeProjects, { recursive: true });
    const envDir = await mkdtemp(path.join(os.tmpdir(), "control-plane-env-"));
    process.env[CLAUDE_DATA_ROOT_ENV] = envDir;
    try {
      const resolved = resolveDataRoot();
      expect(resolved).toEqual({ directory: envDir, origin: "env" });
    } finally {
      await rm(envDir, { recursive: true, force: true });
    }
  });

  it("given_empty_env_var__when_resolving__then_it_falls_back_to_null_when_no_home_dir", () => {
    process.env[CLAUDE_DATA_ROOT_ENV] = "   ";
    expect(resolveDataRoot()).toBeNull();
  });

  it("given_env_var_pointing_at_missing_dir__when_listing__then_returns_ok_true_with_empty_array", async () => {
    const missing = path.join(os.tmpdir(), `control-plane-missing-${Date.now()}-${Math.random()}`);
    process.env[CLAUDE_DATA_ROOT_ENV] = missing;

    const result = await listSessionsOrEmpty();
    expect(result).toEqual({ ok: true, sessions: [] });
  });

  it("given_env_var_with_a_valid_jsonl__when_listing__then_returns_the_session", async () => {
    const { root, sessionId } = await writeSampleTranscript();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await listSessionsOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.sessionId).toBe(sessionId);
    expect(result.sessions[0]!.projectId).toBe("sample-project");
  });

  it("given_env_var_with_a_valid_jsonl__when_loading_session__then_returns_normalized_transcript", async () => {
    const { root, sessionId } = await writeSampleTranscript();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await loadSessionOrUndefined(sessionId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transcript.session.id).toBe(sessionId);
    expect(result.transcript.turns.length).toBeGreaterThan(0);
  });

  it("given_unknown_session_id__when_loading_session__then_returns_not_found", async () => {
    const { root } = await writeSampleTranscript();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;

    const result = await loadSessionOrUndefined("00000000-0000-0000-0000-000000000000");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("given_no_configuration__when_asking_for_analytics_source__then_returns_null", () => {
    expect(getConfiguredAnalyticsSource()).toBeNull();
  });

  it("given_configured_data_root__when_listing_project_summaries__then_returns_ok_value", async () => {
    const { root } = await writeSampleTranscript();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await listProjectSummariesOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(1);
    expect(result.value[0]!.sessionCount).toBe(1);
  });

  it("given_configured_data_root__when_loading_a_session_usage__then_returns_the_summary_with_cost_zero_for_no_model_pricing", async () => {
    const { root, sessionId } = await writeSampleTranscript();
    process.env[CLAUDE_DATA_ROOT_ENV] = root;
    const result = await loadSessionUsageOrEmpty(sessionId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.sessionId).toBe(sessionId);
  });

  async function writeSampleTranscript() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "control-plane-sessions-"));
    tempDir = dir;
    const project = path.join(dir, "sample-project");
    await mkdir(project, { recursive: true });

    const sessionId = "11111111-2222-3333-4444-555555555555";
    const entries = [
      {
        type: "user",
        sessionId,
        uuid: "entry-user-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        cwd: "/tmp/sample",
        version: "1.0.0",
        message: { role: "user", content: "hello control plane" },
      },
      {
        type: "assistant",
        sessionId,
        uuid: "entry-assistant-1",
        timestamp: "2026-01-01T00:00:01.000Z",
        cwd: "/tmp/sample",
        version: "1.0.0",
        message: {
          role: "assistant",
          model: "claude-test",
          content: [{ type: "text", text: "hello from claude" }],
        },
      },
    ];
    const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(path.join(project, `${sessionId}.jsonl`), jsonl, "utf8");

    return { root: dir, sessionId };
  }
});

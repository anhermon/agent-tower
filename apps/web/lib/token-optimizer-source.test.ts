import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importActual<typeof import(...)> pattern requires inline import type
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir(),
  };
});

// Import under test AFTER the vi.mock call so that the module captures the
// mocked `homedir`.
const {
  CLAUDE_CONTROL_PLANE_DATA_ROOT,
  computeAttribution,
  listTools,
  toggleTool,
  updateToolTags,
} = await import("./token-optimizer-source");

describe("token-optimizer-source", () => {
  const originalDataRootEnv = process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT];
  let tempDir: string | null = null;

  beforeEach(async () => {
    delete process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-"));
    tempDir = sandbox;
    mockedHome = sandbox;
  });

  afterEach(async () => {
    if (originalDataRootEnv === undefined) {
      delete process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT];
    } else {
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = originalDataRootEnv;
    }
    mockedHome = null;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  // ─── listTools ─────────────────────────────────────────────────────────────

  describe("listTools", () => {
    it("given_no_registry__when_listing__then_returns_all_5_tools_with_defaults", async () => {
      // Use a temp dir as cwd so no real .mcp.json interferes
      const tools = await listTools(tempDir!);
      expect(tools).toHaveLength(5);

      const ids = tools.map((t) => t.id);
      expect(ids).toContain("rtk");
      expect(ids).toContain("context-mode");
      expect(ids).toContain("token-savior");
      expect(ids).toContain("code-review-graph");
      expect(ids).toContain("graphify");
    });

    it("given_no_registry__when_listing__then_all_tools_have_enabled_false_and_empty_tags", async () => {
      const tools = await listTools(tempDir!);
      for (const tool of tools) {
        expect(tool.enabled).toBe(false);
        expect(tool.tags).toEqual([]);
        expect(tool.version).toBeNull();
        expect(tool.installedAt).toBeNull();
        expect(tool.enabledAt).toBeNull();
        expect(tool.disabledAt).toBeNull();
      }
    });

    it("given_existing_registry__when_listing__then_registry_values_are_overlaid", async () => {
      const registryDir = path.join(tempDir!, ".claude", "token-optimizer");
      await mkdir(registryDir, { recursive: true });
      const registry = {
        rtk: {
          enabled: true,
          tags: ["compression"],
          enabledAt: "2026-01-01T00:00:00.000Z",
        },
      };
      await writeFile(path.join(registryDir, "registry.json"), JSON.stringify(registry), "utf8");

      const tools = await listTools(tempDir!);
      const rtk = tools.find((t) => t.id === "rtk");
      expect(rtk).toBeDefined();
      expect(rtk!.enabled).toBe(true);
      expect(rtk!.tags).toEqual(["compression"]);
      expect(rtk!.enabledAt).toBe("2026-01-01T00:00:00.000Z");

      // Other tools still have defaults
      const graphify = tools.find((t) => t.id === "graphify");
      expect(graphify!.enabled).toBe(false);
      expect(graphify!.tags).toEqual([]);
    });

    it("given_no_registry__when_listing__then_static_metadata_is_correct", async () => {
      const tools = await listTools(tempDir!);
      const rtk = tools.find((t) => t.id === "rtk");
      expect(rtk).toBeDefined();
      expect(rtk!.name).toBe("RTK");
      expect(rtk!.integrationKind).toBe("hook");
      expect(rtk!.source).toContain("rtk");
    });

    it("given_corrupt_registry_json__when_listing__then_returns_all_5_tools_with_defaults", async () => {
      const registryDir = path.join(tempDir!, ".claude", "token-optimizer");
      await mkdir(registryDir, { recursive: true });
      await writeFile(path.join(registryDir, "registry.json"), "not-json", "utf8");

      const tools = await listTools(tempDir!);
      expect(tools).toHaveLength(5);
      for (const tool of tools) {
        expect(tool.enabled).toBe(false);
        expect(tool.tags).toEqual([]);
      }
    });

    it("given_code_review_graph_mcp_json__when_listing__then_detects_as_installed", async () => {
      // Write a .mcp.json in the cwd (tempDir) containing code-review-graph
      const mcpJson = {
        mcpServers: {
          "code-review-graph": {
            command: "node",
            args: ["dist/index.js"],
          },
        },
      };
      await writeFile(path.join(tempDir!, ".mcp.json"), JSON.stringify(mcpJson), "utf8");

      const tools = await listTools(tempDir!);
      const crg = tools.find((t) => t.id === "code-review-graph");
      expect(crg!.detectedInstalled).toBe(true);
    });
  });

  // ─── toggleTool ────────────────────────────────────────────────────────────

  describe("toggleTool", () => {
    it("given_no_registry__when_enabling__then_creates_registry_with_enabled_true", async () => {
      await toggleTool("rtk", true);

      const registryPath = path.join(tempDir!, ".claude", "token-optimizer", "registry.json");
      const raw = await import("node:fs/promises").then((m) => m.readFile(registryPath, "utf8"));
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.rtk).toBeDefined();
      const rtkEntry = parsed.rtk as Record<string, unknown>;
      expect(rtkEntry.enabled).toBe(true);
      expect(typeof rtkEntry.enabledAt).toBe("string");
      expect(rtkEntry.disabledAt).toBeNull();
    });

    it("given_enabled_tool__when_disabling__then_updates_disabledAt", async () => {
      await toggleTool("context-mode", true);
      await toggleTool("context-mode", false);

      const registryPath = path.join(tempDir!, ".claude", "token-optimizer", "registry.json");
      const raw = await import("node:fs/promises").then((m) => m.readFile(registryPath, "utf8"));
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const entry = parsed["context-mode"] as Record<string, unknown>;
      expect(entry.enabled).toBe(false);
      expect(typeof entry.disabledAt).toBe("string");
    });

    it("given_toggle__when_listing_after__then_listTools_reflects_new_state", async () => {
      await toggleTool("graphify", true);
      const tools = await listTools(tempDir!);
      const graphify = tools.find((t) => t.id === "graphify");
      expect(graphify!.enabled).toBe(true);
    });

    it("given_already_enabled_tool__when_enabling_again__then_enabledAt_is_not_clobbered", async () => {
      await toggleTool("rtk", true);

      const registryPath = path.join(tempDir!, ".claude", "token-optimizer", "registry.json");
      const raw1 = await import("node:fs/promises").then((m) => m.readFile(registryPath, "utf8"));
      const firstEnabledAt = (JSON.parse(raw1) as Record<string, Record<string, unknown>>).rtk
        .enabledAt as string;

      // Small delay so clock advances, then toggle again with enabled=true
      await new Promise((r) => setTimeout(r, 5));
      await toggleTool("rtk", true);

      const raw2 = await import("node:fs/promises").then((m) => m.readFile(registryPath, "utf8"));
      const secondEnabledAt = (JSON.parse(raw2) as Record<string, Record<string, unknown>>).rtk
        .enabledAt as string;

      // Idempotent call must NOT overwrite the original timestamp
      expect(secondEnabledAt).toBe(firstEnabledAt);
    });

    it("given_already_disabled_tool__when_disabling_again__then_disabledAt_is_not_clobbered", async () => {
      await toggleTool("token-savior", true);
      await toggleTool("token-savior", false);

      const registryPath = path.join(tempDir!, ".claude", "token-optimizer", "registry.json");
      const raw1 = await import("node:fs/promises").then((m) => m.readFile(registryPath, "utf8"));
      const firstDisabledAt = (JSON.parse(raw1) as Record<string, Record<string, unknown>>)[
        "token-savior"
      ].disabledAt as string;

      await new Promise((r) => setTimeout(r, 5));
      await toggleTool("token-savior", false);

      const raw2 = await import("node:fs/promises").then((m) => m.readFile(registryPath, "utf8"));
      const secondDisabledAt = (JSON.parse(raw2) as Record<string, Record<string, unknown>>)[
        "token-savior"
      ].disabledAt as string;

      expect(secondDisabledAt).toBe(firstDisabledAt);
    });

    it("given_multiple_tools__when_toggling_one__then_other_tools_unaffected", async () => {
      await toggleTool("rtk", true);
      await toggleTool("graphify", false);

      const tools = await listTools(tempDir!);
      const rtk = tools.find((t) => t.id === "rtk");
      const graphify = tools.find((t) => t.id === "graphify");
      expect(rtk!.enabled).toBe(true);
      expect(graphify!.enabled).toBe(false);
    });
  });

  // ─── updateToolTags ────────────────────────────────────────────────────────

  describe("updateToolTags", () => {
    it("given_no_registry__when_updating_tags__then_creates_registry_with_tags", async () => {
      await updateToolTags("token-savior", ["mcp", "recall"]);

      const registryPath = path.join(tempDir!, ".claude", "token-optimizer", "registry.json");
      const raw = await import("node:fs/promises").then((m) => m.readFile(registryPath, "utf8"));
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const entry = parsed["token-savior"] as Record<string, unknown>;
      expect(entry.tags).toEqual(["mcp", "recall"]);
    });

    it("given_existing_entry__when_updating_tags__then_does_not_touch_enabled_field", async () => {
      await toggleTool("rtk", true);
      await updateToolTags("rtk", ["compression", "bash"]);

      const tools = await listTools(tempDir!);
      const rtk = tools.find((t) => t.id === "rtk");
      // enabled must still be true from the prior toggleTool call
      expect(rtk!.enabled).toBe(true);
      expect(rtk!.tags).toEqual(["compression", "bash"]);
    });

    it("given_existing_tags__when_updating_tags__then_replaces_them", async () => {
      await updateToolTags("rtk", ["old-tag"]);
      await updateToolTags("rtk", ["new-tag-a", "new-tag-b"]);

      const tools = await listTools(tempDir!);
      const rtk = tools.find((t) => t.id === "rtk");
      expect(rtk!.tags).toEqual(["new-tag-a", "new-tag-b"]);
    });
  });

  // ─── computeAttribution ────────────────────────────────────────────────────

  describe("computeAttribution", () => {
    it("given_no_data_root__when_computing__then_returns_empty_report_with_5_rows", async () => {
      // tempDir has no .claude/projects subdir, env var is unset
      const report = await computeAttribution();

      expect(report.totalSessionsAnalyzed).toBe(0);
      expect(report.totalEstimatedSavings).toBe(0);
      expect(report.rows).toHaveLength(5);
      expect(typeof report.generatedAt).toBe("string");

      const ids = report.rows.map((r) => r.toolId);
      expect(ids).toContain("rtk");
      expect(ids).toContain("context-mode");
      expect(ids).toContain("token-savior");
      expect(ids).toContain("code-review-graph");
      expect(ids).toContain("graphify");
    });

    it("given_no_data_root__when_computing__then_all_rows_have_zero_counts", async () => {
      const report = await computeAttribution();

      for (const row of report.rows) {
        expect(row.sessionsObserved).toBe(0);
        expect(row.toolCallsObserved).toBe(0);
        expect(row.estimatedTokensSaved).toBe(0);
        expect(row.percentReduction).toBe(0);
      }
    });

    it("given_session_with_ctx_tool_calls__when_computing__then_context_mode_has_hits", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-data-"));
      const projectDir = path.join(dataRoot, "sample-project");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const entries = [
        {
          type: "user",
          sessionId,
          uuid: "u1",
          timestamp: "2026-01-01T00:00:00.000Z",
          message: { role: "user", content: "do something" },
        },
        {
          type: "assistant",
          sessionId,
          uuid: "a1",
          timestamp: "2026-01-01T00:00:01.000Z",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "ctx_store",
                input: { key: "foo", value: "bar" },
              },
            ],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
            },
          },
        },
      ];

      const jsonl = entries.map((e) => JSON.stringify(e)).join("\n");
      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), jsonl, "utf8");

      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const ctxRow = report.rows.find((r) => r.toolId === "context-mode");
        expect(ctxRow).toBeDefined();
        expect(ctxRow!.toolCallsObserved).toBe(1);
        expect(ctxRow!.estimatedTokensSaved).toBe(400);
        expect(report.totalSessionsAnalyzed).toBe(1);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    it("given_session_with_graphify_tool_call__when_computing__then_graphify_has_hits", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-data2-"));
      const projectDir = path.join(dataRoot, "proj2");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "11111111-2222-3333-4444-555555555555";
      const entries = [
        {
          type: "assistant",
          sessionId,
          uuid: "a1",
          timestamp: "2026-01-01T00:00:00.000Z",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool-g",
                name: "graphify",
                input: { query: "find patterns" },
              },
            ],
            usage: { input_tokens: 200, output_tokens: 100 },
          },
        },
      ];

      const jsonl = entries.map((e) => JSON.stringify(e)).join("\n");
      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), jsonl, "utf8");

      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const graphifyRow = report.rows.find((r) => r.toolId === "graphify");
        expect(graphifyRow!.toolCallsObserved).toBe(1);
        expect(graphifyRow!.estimatedTokensSaved).toBe(400);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    // ─── Fix 3: token-savior and code-review-graph attribution ────────────────

    it("given_session_with_recall_tool__when_computing__then_token_savior_has_hits", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-ts1-"));
      const projectDir = path.join(dataRoot, "proj-ts");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "aaaaaaaa-1111-2222-3333-444444444444";
      const entry = {
        type: "assistant",
        sessionId,
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "recall_something", input: {} }],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      };

      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), JSON.stringify(entry), "utf8");
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const row = report.rows.find((r) => r.toolId === "token-savior");
        expect(row!.toolCallsObserved).toBe(1);
        expect(row!.estimatedTokensSaved).toBe(400);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    it("given_session_with_navigate_tool__when_computing__then_token_savior_has_hits", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-ts2-"));
      const projectDir = path.join(dataRoot, "proj-ts2");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "bbbbbbbb-1111-2222-3333-444444444444";
      const entry = {
        type: "assistant",
        sessionId,
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "navigate_something", input: {} }],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      };

      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), JSON.stringify(entry), "utf8");
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const row = report.rows.find((r) => r.toolId === "token-savior");
        expect(row!.toolCallsObserved).toBe(1);
        expect(row!.estimatedTokensSaved).toBe(400);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    it("given_session_with_token_savior_server_name__when_computing__then_token_savior_has_hits", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-ts3-"));
      const projectDir = path.join(dataRoot, "proj-ts3");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "cccccccc-1111-2222-3333-444444444444";
      const entry = {
        type: "assistant",
        sessionId,
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "some_tool",
              server_name: "token-savior-recall",
              input: {},
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      };

      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), JSON.stringify(entry), "utf8");
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const row = report.rows.find((r) => r.toolId === "token-savior");
        expect(row!.toolCallsObserved).toBe(1);
        expect(row!.estimatedTokensSaved).toBe(400);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    it("given_session_with_code_review_graph_server_name__when_computing__then_code_review_graph_has_hits", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-crg-"));
      const projectDir = path.join(dataRoot, "proj-crg");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "dddddddd-1111-2222-3333-444444444444";
      const entry = {
        type: "assistant",
        sessionId,
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "review_something",
              server_name: "code-review-graph",
              input: {},
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      };

      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), JSON.stringify(entry), "utf8");
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const row = report.rows.find((r) => r.toolId === "code-review-graph");
        expect(row!.toolCallsObserved).toBe(1);
        expect(row!.estimatedTokensSaved).toBe(400);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    // ─── Fix 4: malformed JSONL lines ─────────────────────────────────────────

    it("given_session_with_mixed_valid_and_malformed_jsonl__when_computing__then_valid_hits_counted_and_no_throw", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-malformed-"));
      const projectDir = path.join(dataRoot, "proj-malformed");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "eeeeeeee-1111-2222-3333-444444444444";
      const validEntry = JSON.stringify({
        type: "assistant",
        sessionId,
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "ctx_load", input: {} }],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      });
      const jsonl = ["this is not json", validEntry, "{ broken: json }"].join("\n");

      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), jsonl, "utf8");
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const ctxRow = report.rows.find((r) => r.toolId === "context-mode");
        // The valid ctx_load line must be counted
        expect(ctxRow!.toolCallsObserved).toBe(1);
        expect(ctxRow!.estimatedTokensSaved).toBe(400);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    // ─── Fix 5: RTK detection regex ───────────────────────────────────────────

    it("given_bash_command_echo_rtk_args__when_computing__then_rtk_NOT_counted", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-rtk1-"));
      const projectDir = path.join(dataRoot, "proj-rtk");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "ffffffff-1111-2222-3333-444444444444";
      const entry = JSON.stringify({
        type: "assistant",
        sessionId,
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Bash",
              input: { command: "echo rtk args" },
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      });

      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), entry, "utf8");
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const rtkRow = report.rows.find((r) => r.toolId === "rtk");
        // "echo rtk args" passes rtk as an argument, not an invocation — should NOT match
        expect(rtkRow!.toolCallsObserved).toBe(0);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    it("given_bash_command_rtk_compress_file__when_computing__then_rtk_counted", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-rtk2-"));
      const projectDir = path.join(dataRoot, "proj-rtk2");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "00000000-1111-2222-3333-444444444444";
      const entry = JSON.stringify({
        type: "assistant",
        sessionId,
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Bash",
              input: { command: "rtk compress file" },
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      });

      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), entry, "utf8");
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const rtkRow = report.rows.find((r) => r.toolId === "rtk");
        expect(rtkRow!.toolCallsObserved).toBe(1);
        expect(rtkRow!.estimatedTokensSaved).toBe(400);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });

    it("given_bash_command_rtk_hook_claude__when_computing__then_rtk_counted", async () => {
      const dataRoot = await mkdtemp(path.join(os.tmpdir(), "control-plane-tokenopt-rtk3-"));
      const projectDir = path.join(dataRoot, "proj-rtk3");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "11111111-aaaa-bbbb-cccc-dddddddddddd";
      const entry = JSON.stringify({
        type: "assistant",
        sessionId,
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Bash",
              input: { command: "rtk hook claude" },
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      });

      await writeFile(path.join(projectDir, `${sessionId}.jsonl`), entry, "utf8");
      process.env[CLAUDE_CONTROL_PLANE_DATA_ROOT] = dataRoot;
      try {
        const report = await computeAttribution();
        const rtkRow = report.rows.find((r) => r.toolId === "rtk");
        expect(rtkRow!.toolCallsObserved).toBe(1);
        expect(rtkRow!.estimatedTokensSaved).toBe(400);
      } finally {
        await rm(dataRoot, { recursive: true, force: true });
      }
    });
  });
});

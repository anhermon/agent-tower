import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HARNESS_KINDS, listDetectedHarnesses } from "./harness-detector.js";

// Mock node:fs/promises and node:os BEFORE the module under test is imported
// so that hoisted vi.mock calls see the fakes.
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(),
}));

// Resolve the mocks after the vi.mock blocks are hoisted.
const { access, readdir } = await import("node:fs/promises");
const { homedir } = await import("node:os");
const mockedAccess = vi.mocked(access);
const mockedReaddir = vi.mocked(readdir);
const mockedHomedir = vi.mocked(homedir);

const HOME = "/home/testuser";

describe("listDetectedHarnesses", () => {
  beforeEach(() => {
    mockedHomedir.mockReturnValue(HOME);
    // By default: no paths exist, no directories readable.
    mockedAccess.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    mockedReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("given_no_paths_exist__when_called__then_returns_empty_array", async () => {
    const result = await listDetectedHarnesses();
    expect(result).toEqual([]);
  });

  it("given_claude_dir_exists__when_called__then_returns_claude_code_harness", async () => {
    const claudeDir = join(HOME, ".claude");
    mockedAccess.mockImplementation((path) => {
      if (path === claudeDir) return Promise.resolve();
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const result = await listDetectedHarnesses();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: HARNESS_KINDS.ClaudeCode,
      displayName: "Claude Code",
      detectedPath: claudeDir,
    });
  });

  it("given_continue_dir_exists__when_called__then_returns_continue_harness", async () => {
    const continueDir = join(HOME, ".continue");
    mockedAccess.mockImplementation((path) => {
      if (path === continueDir) return Promise.resolve();
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const result = await listDetectedHarnesses();

    const entry = result.find((h) => h.kind === HARNESS_KINDS.Continue);
    expect(entry).toBeDefined();
    expect(entry?.detectedPath).toBe(continueDir);
  });

  it("given_multiple_harness_paths_exist__when_called__then_returns_all_detected", async () => {
    const claudeDir = join(HOME, ".claude");
    const aiderDir = join(HOME, ".aider");
    const zedDir = join(HOME, ".config", "zed");
    mockedAccess.mockImplementation((path) => {
      if (path === claudeDir || path === aiderDir || path === zedDir) return Promise.resolve();
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const result = await listDetectedHarnesses();
    const kinds = result.map((h) => h.kind);

    expect(kinds).toContain(HARNESS_KINDS.ClaudeCode);
    expect(kinds).toContain(HARNESS_KINDS.Aider);
    expect(kinds).toContain(HARNESS_KINDS.Zed);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("given_prefix_indicator_matches__when_called__then_returns_harness_with_full_path", async () => {
    const extensionsDir = join(HOME, ".vscode", "extensions");
    const matchedEntry = "saoudrizwan.claude-dev-3.14.0";
    mockedReaddir.mockImplementation((dir) => {
      if (dir === extensionsDir)
        return Promise.resolve([matchedEntry] as unknown as Awaited<ReturnType<typeof readdir>>);
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const result = await listDetectedHarnesses();
    const cline = result.find((h) => h.kind === HARNESS_KINDS.Cline);

    expect(cline).toBeDefined();
    expect(cline?.kind).toBe(HARNESS_KINDS.Cline);
    expect(cline?.detectedPath).toBe(join(extensionsDir, matchedEntry));
  });

  it("given_prefix_indicator_dir_has_no_matching_entry__when_called__then_harness_not_detected", async () => {
    const extensionsDir = join(HOME, ".vscode", "extensions");
    mockedReaddir.mockImplementation((dir) => {
      if (dir === extensionsDir)
        return Promise.resolve(["some-other-extension-1.0.0"] as unknown as Awaited<
          ReturnType<typeof readdir>
        >);
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const result = await listDetectedHarnesses();
    expect(result.find((h) => h.kind === HARNESS_KINDS.Cline)).toBeUndefined();
  });

  it("given_second_indicator_matches__when_called__then_first_match_is_returned_as_detected_path", async () => {
    // Claude Code has three path indicators; make only the second one (~Windows path) match.
    const windowsClaudeDir = join(HOME, "AppData", "Roaming", "claude");
    mockedAccess.mockImplementation((path) => {
      if (path === windowsClaudeDir) return Promise.resolve();
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const result = await listDetectedHarnesses();
    const entry = result.find((h) => h.kind === HARNESS_KINDS.ClaudeCode);

    expect(entry).toBeDefined();
    expect(entry?.detectedPath).toBe(windowsClaudeDir);
  });

  it("given_windsurf_codeium_dir_exists__when_called__then_returns_windsurf_harness", async () => {
    const codeiumDir = join(HOME, ".codeium");
    mockedAccess.mockImplementation((path) => {
      if (path === codeiumDir) return Promise.resolve();
      return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    });

    const result = await listDetectedHarnesses();
    const entry = result.find((h) => h.kind === HARNESS_KINDS.Windsurf);

    expect(entry).toBeDefined();
    expect(entry?.kind).toBe(HARNESS_KINDS.Windsurf);
  });
});

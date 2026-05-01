/**
 * Harness kind identifiers — browser-safe (no Node.js imports).
 *
 * Extracted from harness-detector.ts so that SessionUsageSummary and other
 * domain types can reference HarnessKind without pulling in node:fs/node:os.
 *
 * Import via the main barrel:
 *   import type { HarnessKind } from "@control-plane/core";
 */

export const HARNESS_KINDS = {
  ClaudeCode: "claude-code",
  Cline: "cline",
  Cursor: "cursor",
  Continue: "continue",
  Copilot: "copilot",
  Aider: "aider",
  Windsurf: "windsurf",
  Zed: "zed",
  OpenCode: "opencode",
  Codex: "codex",
  GeminiCli: "gemini-cli",
} as const;

export type HarnessKind = (typeof HARNESS_KINDS)[keyof typeof HARNESS_KINDS];

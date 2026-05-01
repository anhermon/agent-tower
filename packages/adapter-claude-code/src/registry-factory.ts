/**
 * Convenience factory for building an `AdapterRegistry` populated with all
 * known harness adapters that have resolvable data roots.
 *
 * Shared by the web dashboard, CLI, and MCP server so harness registration
 * logic lives in one place. Adding a new harness = register it here.
 */

import { AdapterRegistry } from "@control-plane/core";

import { ClaudeCodeHarnessAdapter } from "./harness-adapter.js";
import { CodexHarnessAdapter, resolveCodexDataRoot } from "./codex-adapter.js";
import { resolveDataRoot } from "./data-root.js";

/**
 * Build a registry pre-populated with every harness adapter whose data root
 * can be resolved on the current machine. Adapters for missing roots are
 * silently omitted — callers should check `registry.isEmpty` and handle the
 * unconfigured state.
 *
 * @param claudeDataRoot - Explicit Claude Code data root. When omitted,
 *   `resolveDataRoot()` is used (env var → ~/.claude/projects).
 * @param codexDataRoot - Explicit Codex data root. When omitted,
 *   `resolveCodexDataRoot()` is used (env var → ~/.codex).
 */
export function buildAdapterRegistry(options?: {
  readonly claudeDataRoot?: string;
  readonly codexDataRoot?: string;
}): AdapterRegistry {
  const registry = new AdapterRegistry();

  // Claude Code — resolves via env or ~/.claude/projects.
  const claudeRoot = options?.claudeDataRoot ?? resolveDataRoot()?.directory;
  if (claudeRoot) {
    registry.register(new ClaudeCodeHarnessAdapter(claudeRoot));
  }

  // Codex CLI — resolves via env or ~/.codex.
  const codexRoot = options?.codexDataRoot ?? resolveCodexDataRoot();
  if (codexRoot) {
    registry.register(new CodexHarnessAdapter(codexRoot));
  }

  return registry;
}

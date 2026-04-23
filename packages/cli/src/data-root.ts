import {
  CLAUDE_DATA_ROOT_ENV,
  type ResolvedDataRoot,
  resolveDataRoot,
} from "@control-plane/adapter-claude-code";

import { bold, dim, writeJson, writeLine } from "./output.js";

/**
 * Shared "resolve data root or print guidance" helper. On failure the caller
 * MUST propagate the returned `null` and exit with code 1 — the function has
 * already written the structured/pretty explanation to stdout. Exit code 1
 * keeps shell automation honest about operational failures and matches the
 * `control_plane_health` MCP tool's `{ok:false, reason:"unconfigured"}`
 * envelope.
 */
export function resolveOrExplain(options: {
  readonly json: boolean;
  readonly pretty: boolean;
}): ResolvedDataRoot | null {
  const resolved = resolveDataRoot();
  if (resolved) return resolved;

  if (options.json) {
    writeJson({
      ok: false,
      reason: "unconfigured",
      env: CLAUDE_DATA_ROOT_ENV,
      message: `No Claude Code data root configured. Set ${CLAUDE_DATA_ROOT_ENV} to the absolute path of your Claude Code projects directory (typically ~/.claude/projects).`,
    });
    return null;
  }

  writeLine(bold("Data root not configured."));
  writeLine("");
  writeLine(`Set ${CLAUDE_DATA_ROOT_ENV} to your Claude Code projects directory.`);
  writeLine(dim("Example:"));
  writeLine(`  export ${CLAUDE_DATA_ROOT_ENV}="$HOME/.claude/projects"`);
  return null;
}

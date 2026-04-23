import {
  CLAUDE_DATA_ROOT_ENV,
  listSessionFiles,
  listSkillsOrEmpty,
  resolveDataRoot,
} from "@control-plane/adapter-claude-code";

import { parseFlags } from "../flags.js";
import { bold, resolveOutputMode, writeJson, writeLine } from "../output.js";

export async function runHealth(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{ json?: boolean; pretty?: boolean }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });
  const mode = resolveOutputMode(values);
  const resolved = resolveDataRoot();

  if (!resolved) {
    // Unconfigured is an operational failure, not a success probe. Match the
    // MCP tool (`control_plane_health`) so automation sees the same envelope
    // across CLI and MCP: `{ok:false, reason:"unconfigured"}` with exit 1.
    if (mode.json) {
      writeJson({
        ok: false,
        reason: "unconfigured",
        env: CLAUDE_DATA_ROOT_ENV,
        message: `No Claude Code data root configured. Set ${CLAUDE_DATA_ROOT_ENV} to the absolute path of your Claude Code projects directory (typically ~/.claude/projects).`,
      });
      return 1;
    }
    writeLine(bold("Status: data root not configured"));
    writeLine(`Set ${CLAUDE_DATA_ROOT_ENV} to your Claude Code projects directory.`);
    return 1;
  }

  const files = await listSessionFiles({ directory: resolved.directory });
  const skillsResult = await listSkillsOrEmpty();
  const skillCount = skillsResult.ok ? skillsResult.skills.length : 0;

  if (mode.json) {
    writeJson({
      ok: true,
      dataRoot: { directory: resolved.directory, origin: resolved.origin },
      sessionCount: files.length,
      skillCount,
    });
    return 0;
  }

  writeLine(bold("Control plane health"));
  writeLine("");
  writeLine(`Data root:    ${resolved.directory}`);
  writeLine(`Origin:       ${resolved.origin}`);
  writeLine(`Sessions:     ${files.length}`);
  writeLine(`Skills:       ${skillCount}`);
  return 0;
}

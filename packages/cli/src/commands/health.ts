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
    if (mode.json) {
      writeJson({ ok: true, dataRoot: null, sessionCount: 0, skillCount: 0 });
      return 0;
    }
    writeLine(bold("Status: data root not configured"));
    writeLine(`Set ${CLAUDE_DATA_ROOT_ENV} to your Claude Code projects directory.`);
    return 0;
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

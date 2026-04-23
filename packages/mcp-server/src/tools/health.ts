import {
  listSessionFiles,
  listSkillsOrEmpty,
  resolveDataRoot,
} from "@control-plane/adapter-claude-code";
import { errorResult, type ToolDefinition, type ToolResult } from "./types.js";

export const healthTool: ToolDefinition = {
  name: "control_plane_health",
  description:
    "Read-only health probe. Reports the resolved Claude Code data root, the number of session files visible, and the number of skill manifests discovered.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (): Promise<ToolResult> => {
    try {
      const resolved = resolveDataRoot();
      if (!resolved) {
        return { ok: false, reason: "unconfigured" };
      }
      const files = await listSessionFiles({ directory: resolved.directory });
      const skills = await listSkillsOrEmpty();
      return {
        ok: true,
        dataRoot: {
          directory: resolved.directory,
          origin: resolved.origin,
        },
        sessionCount: files.length,
        skillCount: skills.ok ? skills.skills.length : 0,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

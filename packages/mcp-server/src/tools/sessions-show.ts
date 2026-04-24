import {
  ClaudeCodeAnalyticsSource,
  computeSkillTurnAttribution,
  computeTurnTimeline,
  listSessionFiles,
  readTranscriptFile,
  resolveDataRoot,
} from "@control-plane/adapter-claude-code";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

interface ParsedSessionsShowInput {
  readonly sessionId: string;
  readonly includeTurns: boolean;
  readonly includeTimeline: boolean;
}

function parseInput(raw: unknown): ParsedSessionsShowInput | { readonly error: string } {
  const r = asRecord(raw);
  const sessionId = r.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { error: "sessionId is required and must be a non-empty string" };
  }
  const includeTurns = r.includeTurns;
  const includeTimeline = r.includeTimeline;
  return {
    sessionId,
    includeTurns: typeof includeTurns === "boolean" ? includeTurns : false,
    includeTimeline: typeof includeTimeline === "boolean" ? includeTimeline : false,
  };
}

export const sessionsShowTool: ToolDefinition = {
  name: "sessions_show",
  description:
    "Read-only. Loads a single session usage summary by session id. Turn-by-turn detail is omitted unless includeTurns=true.",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "The Claude Code session id (the JSONL filename minus the .jsonl suffix).",
      },
      includeTurns: {
        type: "boolean",
        description: "When true, include the per-turn usage breakdown. Defaults to false.",
      },
      includeTimeline: {
        type: "boolean",
        description:
          "When true, include per-turn tool/token timeline and skill-to-turn attribution. Defaults to false.",
      },
    },
    required: ["sessionId"],
    additionalProperties: false,
  },
  handler: async (raw): Promise<ToolResult> => {
    try {
      const parsed = parseInput(raw);
      if ("error" in parsed) {
        return { ok: false, reason: "invalid_input", message: parsed.error };
      }
      const resolved = resolveDataRoot();
      if (!resolved) {
        return { ok: false, reason: "unconfigured" };
      }
      const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
      const summary = await source.loadSessionUsage(parsed.sessionId);
      if (!summary) {
        return {
          ok: false,
          reason: "not_found",
          message: `No session with id ${parsed.sessionId}`,
        };
      }
      const projected = parsed.includeTurns
        ? summary
        : (() => {
            const { turns: _turns, ...rest } = summary;
            void _turns;
            return rest;
          })();

      let timeline = undefined;
      let skillAttribution = undefined;
      if (parsed.includeTimeline) {
        const files = await listSessionFiles({ directory: resolved.directory });
        const file = files.find((f) => f.sessionId === parsed.sessionId);
        if (file) {
          const { entries } = await readTranscriptFile(file.filePath);
          timeline = computeTurnTimeline(entries, { sessionId: parsed.sessionId });
          skillAttribution = computeSkillTurnAttribution(entries, { sessionId: parsed.sessionId });
        }
      }

      return {
        ok: true,
        sessionId: parsed.sessionId,
        includeTurns: parsed.includeTurns,
        includeTimeline: parsed.includeTimeline,
        session: {
          ...projected,
          ...(timeline ? { timeline } : {}),
          ...(skillAttribution ? { skillAttribution } : {}),
        },
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

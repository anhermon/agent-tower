import {
  ClaudeCodeAnalyticsSource,
  computeSkillTurnAttribution,
  computeTurnTimeline,
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
          "When true, attach per-turn tool/token rollup (timeline) and skill-to-turn attribution (skillAttribution). Defaults to false.",
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
      if (parsed.includeTimeline) {
        const parsed2 = await source.loadSessionEntries(parsed.sessionId);
        const entries = parsed2?.entries ?? [];
        const timeline = computeTurnTimeline(entries, { sessionId: parsed.sessionId });
        const skillAttribution = computeSkillTurnAttribution(entries, {
          sessionId: parsed.sessionId,
        });
        return {
          ok: true,
          sessionId: parsed.sessionId,
          includeTurns: parsed.includeTurns,
          includeTimeline: true,
          session: { ...(projected as object), timeline, skillAttribution },
        };
      }
      return {
        ok: true,
        sessionId: parsed.sessionId,
        includeTurns: parsed.includeTurns,
        session: projected,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

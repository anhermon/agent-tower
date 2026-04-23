import { ClaudeCodeAnalyticsSource, resolveDataRoot } from "@control-plane/adapter-claude-code";

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
    "Read-only. Loads a single session usage summary by session id. Turn-by-turn detail is omitted unless includeTurns=true. Pass includeTimeline=true to attach per-turn timeline + skill-to-turn attribution.",
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
          "When true, include `timeline` (per-turn tool/token rollup with wastedTurn flag) and `skillAttribution` (per-turn skills activated + cumulative active set). Defaults to false.",
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
      const projectedBase = parsed.includeTurns
        ? summary
        : (() => {
            const { turns: _turns, ...rest } = summary;
            void _turns;
            return rest;
          })();
      let projected: unknown = projectedBase;
      if (parsed.includeTimeline) {
        const bundle = await source.loadSessionTimeline(parsed.sessionId);
        if (bundle) {
          projected = {
            ...(projectedBase as object),
            timeline: bundle.timeline,
            skillAttribution: bundle.skillAttribution,
          };
        }
      }
      return {
        ok: true,
        sessionId: parsed.sessionId,
        includeTurns: parsed.includeTurns,
        includeTimeline: parsed.includeTimeline,
        session: projected,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

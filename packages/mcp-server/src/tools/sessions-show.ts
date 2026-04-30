import {
  ClaudeCodeAnalyticsSource,
  computeBootstrapBreakdown,
  computeSkillTurnAttribution,
  computeToolCostView,
  computeTurnTimeline,
  listSessionFiles,
  readTranscriptFile,
  resolveDataRoot,
  type BootstrapBreakdown,
  type SkillTurnAttribution,
  type ToolCostView,
  type TurnTimeline,
} from "@control-plane/adapter-claude-code";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

interface ParsedSessionsShowInput {
  readonly sessionId: string;
  readonly includeTurns: boolean;
  readonly includeTimeline: boolean;
  readonly includeBootstrap: boolean;
}

function parseInput(raw: unknown): ParsedSessionsShowInput | { readonly error: string } {
  const r = asRecord(raw);
  const sessionId = r.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { error: "sessionId is required and must be a non-empty string" };
  }
  const includeTurns = r.includeTurns;
  const includeTimeline = r.includeTimeline;
  const includeBootstrap = r.includeBootstrap;
  return {
    sessionId,
    includeTurns: typeof includeTurns === "boolean" ? includeTurns : false,
    includeTimeline: typeof includeTimeline === "boolean" ? includeTimeline : false,
    includeBootstrap: typeof includeBootstrap === "boolean" ? includeBootstrap : false,
  };
}

export const sessionsShowTool: ToolDefinition = {
  name: "sessions_show",
  description:
    "Read-only. Loads a single session usage summary by session id. Turn-by-turn detail is omitted unless includeTurns=true. Pass includeTimeline=true for per-turn token ledger + tool cost view + skill attribution. Pass includeBootstrap=true for bootstrap context breakdown (CLAUDE.md / AGENTS.md / skills injected into the system prompt).",
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
          "When true, include per-turn tool/token timeline, tool cost view, and skill-to-turn attribution. Defaults to false.",
      },
      includeBootstrap: {
        type: "boolean",
        description:
          "When true, parse the system prompt and return a breakdown of injected context components (CLAUDE.md, AGENTS.md, skills, etc.) with byte and estimated token counts. Defaults to false.",
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

      let timeline: TurnTimeline | undefined;
      let skillAttribution: SkillTurnAttribution | undefined;
      let toolCostView: ToolCostView | undefined;
      let bootstrapBreakdown: BootstrapBreakdown | undefined;

      if (parsed.includeTimeline || parsed.includeBootstrap) {
        const files = await listSessionFiles({ directory: resolved.directory });
        const file = files.find((f) => f.sessionId === parsed.sessionId);
        if (file) {
          const { entries } = await readTranscriptFile(file.filePath);
          if (parsed.includeTimeline) {
            timeline = computeTurnTimeline(entries, { sessionId: parsed.sessionId });
            skillAttribution = computeSkillTurnAttribution(entries, {
              sessionId: parsed.sessionId,
            });
            toolCostView = computeToolCostView(entries, { sessionId: parsed.sessionId });
          }
          if (parsed.includeBootstrap) {
            bootstrapBreakdown = computeBootstrapBreakdown(entries, {
              sessionId: parsed.sessionId,
            });
          }
        }
      }

      return {
        ok: true,
        sessionId: parsed.sessionId,
        includeTurns: parsed.includeTurns,
        includeTimeline: parsed.includeTimeline,
        includeBootstrap: parsed.includeBootstrap,
        session: {
          ...projected,
          ...(timeline ? { timeline } : {}),
          ...(skillAttribution ? { skillAttribution } : {}),
          ...(toolCostView ? { toolCostView } : {}),
          ...(bootstrapBreakdown ? { bootstrapBreakdown } : {}),
        },
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

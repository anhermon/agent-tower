/**
 * Tool cost view — per-tool token attribution from the raw transcript.
 *
 * Claude Code JSONL records token usage per *assistant turn*, not per
 * individual tool call. This fold attributes the cost of each turn to the
 * tools invoked on that turn, distributing output tokens proportionally when
 * multiple tools appear in a single turn.
 *
 * The result answers: "Which tools drove the most tokens?" — useful for
 * spotting expensive tool patterns (e.g., repeated large Read calls bloating
 * cache, or Bash calls that balloon output).
 *
 * Pure fold: no I/O, no clocks. Inputs flow in, the canonical output flows
 * out.
 */

import { isToolUseBlock } from "../content-blocks.js";

import { normalizeTurnUsage } from "./session-summary.js";

import type { ClaudeAssistantEntry, ClaudeContentBlock, ClaudeTranscriptEntry } from "../types.js";

export interface ToolCostEntry {
  /** Tool name as it appears in the `tool_use` block (e.g. "Read", "Bash"). */
  readonly toolName: string;
  /** Total number of `tool_use` blocks for this tool across the session. */
  readonly callCount: number;
  /**
   * Sum of `outputTokens` from every assistant turn that contained at least
   * one call to this tool. When a turn calls multiple distinct tools, each
   * tool is credited the full turn's output tokens (i.e. counts are not split).
   * This reflects that the model spent its generation budget on a turn that
   * used this tool — it's a conservative upper bound, not exact attribution.
   */
  readonly outputTokensFromTurns: number;
  /**
   * Sum of `inputTokens` from turns that used this tool — represents how much
   * of the context window was consumed when the model was about to call this
   * tool. Large values indicate expensive turns leading up to the call.
   */
  readonly inputTokensFromTurns: number;
  /**
   * Sum of `cacheReadInputTokens` from turns that used this tool.
   * High values mean this tool tends to be called inside large cached contexts.
   */
  readonly cacheReadTokensFromTurns: number;
}

export interface ToolCostView {
  readonly sessionId: string;
  /**
   * Per-tool attribution, sorted descending by `outputTokensFromTurns` then
   * by `callCount` as a tiebreaker.
   */
  readonly tools: readonly ToolCostEntry[];
  /** Total tool_use blocks across the session (sum of `entry.callCount`). */
  readonly totalToolCalls: number;
  /** Sum of all `outputTokensFromTurns` across tools (may double-count multi-tool turns). */
  readonly totalAttributedOutputTokens: number;
}

export interface ToolCostViewOptions {
  readonly sessionId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Scan content blocks and return a map of toolName → call count for this turn.
 */
function collectToolCalls(blocks: readonly ClaudeContentBlock[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    if (isToolUseBlock(block) && block.name) {
      counts.set(block.name, (counts.get(block.name) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Credit each tool from a single turn with the turn's token counts.
 * Mutates `toolMap` in-place.
 */
function accumulateToolCosts(
  toolCallsOnTurn: ReadonlyMap<string, number>,
  tokens: { outputTokens: number; inputTokens: number; cacheReadTokens: number },
  toolMap: Map<string, MutableToolCostEntry>
): void {
  for (const [toolName, callCount] of toolCallsOnTurn) {
    const existing = toolMap.get(toolName);
    if (existing) {
      existing.callCount += callCount;
      existing.outputTokensFromTurns += tokens.outputTokens;
      existing.inputTokensFromTurns += tokens.inputTokens;
      existing.cacheReadTokensFromTurns += tokens.cacheReadTokens;
    } else {
      toolMap.set(toolName, {
        toolName,
        callCount,
        outputTokensFromTurns: tokens.outputTokens,
        inputTokensFromTurns: tokens.inputTokens,
        cacheReadTokensFromTurns: tokens.cacheReadTokens,
      });
    }
  }
}

// ─── Fold ─────────────────────────────────────────────────────────────────────

/**
 * Compute per-tool token attribution from a raw session transcript.
 *
 * Algorithm:
 * 1. Iterate assistant entries only (token usage lives on assistant turns).
 * 2. For each assistant turn, collect the set of unique tool names used.
 * 3. For each tool name, accumulate call count + turn token fields.
 *
 * Note: a single turn may use multiple tools. Each tool in that turn is
 * credited the full turn's token counts — this is intentional (see field doc).
 */
export function computeToolCostView(
  entries: readonly ClaudeTranscriptEntry[],
  options: ToolCostViewOptions = {}
): ToolCostView {
  const sessionId = options.sessionId ?? entries[0]?.sessionId ?? "unknown";

  const toolMap = new Map<string, MutableToolCostEntry>();

  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    const asst = entry as ClaudeAssistantEntry;
    const content = asst.message?.content;
    if (!Array.isArray(content)) continue;

    const toolCallsOnTurn = collectToolCalls(content as ClaudeContentBlock[]);
    if (toolCallsOnTurn.size === 0) continue;

    // Extract token usage for this turn and credit each distinct tool.
    const usage = normalizeTurnUsage(asst.message?.usage);
    accumulateToolCosts(
      toolCallsOnTurn,
      {
        outputTokens: usage?.outputTokens ?? 0,
        inputTokens: usage?.inputTokens ?? 0,
        cacheReadTokens: usage?.cacheReadInputTokens ?? 0,
      },
      toolMap
    );
  }

  const tools: ToolCostEntry[] = [...toolMap.values()]
    .sort((a, b) => {
      const byOutput = b.outputTokensFromTurns - a.outputTokensFromTurns;
      return byOutput !== 0 ? byOutput : b.callCount - a.callCount;
    })
    .map((e) => Object.freeze({ ...e }));

  const totalToolCalls = tools.reduce((sum, t) => sum + t.callCount, 0);
  const totalAttributedOutputTokens = tools.reduce((sum, t) => sum + t.outputTokensFromTurns, 0);

  return {
    sessionId,
    tools,
    totalToolCalls,
    totalAttributedOutputTokens,
  };
}

interface MutableToolCostEntry {
  toolName: string;
  callCount: number;
  outputTokensFromTurns: number;
  inputTokensFromTurns: number;
  cacheReadTokensFromTurns: number;
}

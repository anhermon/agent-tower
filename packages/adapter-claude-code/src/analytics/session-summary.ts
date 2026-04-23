import {
  type CacheEfficiency,
  cacheEfficiency,
  categorizeTool,
  EMPTY_CACHE_EFFICIENCY,
  estimateCostFromUsage,
  isMcpTool,
  type ModelUsage,
  type RepeatReadEntry,
  type SessionCompactionEvent,
  type SessionDerivedFlags,
  type SessionTurnUsage,
  type SessionUsageSummary,
  type SessionWasteSignals,
  type TurnUsage,
} from "@control-plane/core";
import type {
  ClaudeAssistantEntry,
  ClaudeContentBlock,
  ClaudeMessageUsage,
  ClaudeRawValue,
  ClaudeSystemEntry,
  ClaudeTranscriptEntry,
  ClaudeUserEntry,
} from "../types.js";

// Pure folds — no I/O, no global clocks. Inputs flow in, canonical output
// flows out. The adapter layer is responsible for loading `entries` from the
// filesystem and passing them here.

export interface FoldSessionOptions {
  readonly sessionId?: string;
  readonly cwd?: string;
  readonly includeTurns?: boolean;
  /**
   * Optional sink: the fold will populate this map with `toolName -> errorCount`
   * (attributed via tool_use_id → tool_result.is_error). Callers that aggregate
   * across sessions merge these into `ToolSummary.errorCount`. Omit to skip
   * the attribution cost entirely (a no-op `Map` allocation).
   */
  readonly toolErrorSink?: Map<string, number>;
}

/** Threshold for flagging sessions that grew past normal context without compacting. */
export const BLOAT_WITHOUT_COMPACTION_THRESHOLD = 150_000;
/** Minimum repetition count before a file_path is surfaced in `waste.repeatReads`. */
export const REPEAT_READ_MIN_COUNT = 3;
/** Upper bound on how many repeat-read entries we surface (top-N by count). */
export const REPEAT_READ_TOP_N = 10;

/**
 * Derive a canonical `SessionUsageSummary` from raw Claude Code JSONL entries.
 * The returned object is always populated (zero-valued fields when the input
 * is sparse) — callers never need to null-check.
 */
export function foldSessionSummary(
  entries: readonly ClaudeTranscriptEntry[],
  options: FoldSessionOptions = {}
): SessionUsageSummary {
  const sessionId = options.sessionId ?? firstDefined(entries, (e) => e.sessionId) ?? "unknown";

  const toolCounts: Record<string, number> = {};
  const usage: Mutable<ModelUsage> = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  const flags: Mutable<SessionDerivedFlags> = {
    hasCompaction: false,
    hasThinking: false,
    usesTaskAgent: false,
    usesMcp: false,
    usesWebSearch: false,
    usesWebFetch: false,
  };
  const compactions: SessionCompactionEvent[] = [];
  const turnsOut: SessionTurnUsage[] = [];
  const turnDurations = new Map<string, number>();

  let firstModel: string | null = null;
  let latestModel: string | null = null;
  let estimatedCostUsd = 0;
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let startTime: string | undefined;
  let endTime: string | undefined;
  let gitBranch: string | undefined;
  let version: string | undefined;
  let cwd: string | undefined = options.cwd;
  let turnIndex = 0;

  // Waste-signal accumulators. All updated in the same pass as the base fold.
  let totalToolUseBlocks = 0;
  let totalToolResults = 0;
  let toolFailures = 0;
  let mcpToolCalls = 0;
  let singleToolTurns = 0;
  let turnsWithTools = 0;
  let peakInputTokensBetweenCompactions = 0;
  let runningInputPeak = 0;
  const distinctToolNames = new Set<string>();
  const readFileCounts = new Map<string, number>();
  const toolErrorSink = options.toolErrorSink;
  // Track tool_use_id -> tool name so we can attribute tool_result errors back
  // to the originating tool even when the result arrives in a later user turn.
  const toolUseIdToName = new Map<string, string>();

  // Pass 1: collect turn_duration system events (keyed by parentUuid) so we
  // can attach them to their assistant turn in pass 2.
  for (const entry of entries) {
    if (entry.type === "system") {
      const sys = entry as ClaudeSystemEntry;
      const subtype = (sys as unknown as { subtype?: string }).subtype;
      const parent = sys.parentUuid ?? undefined;
      const durationMs = (sys as unknown as { durationMs?: number }).durationMs;
      if (subtype === "turn_duration" && parent && typeof durationMs === "number") {
        turnDurations.set(parent, durationMs);
      }
    }
  }

  for (const entry of entries) {
    if (!startTime && entry.timestamp) startTime = entry.timestamp;
    if (entry.timestamp) endTime = entry.timestamp;
    if (!gitBranch && entry.gitBranch && entry.gitBranch !== "HEAD") {
      gitBranch = entry.gitBranch;
    }
    if (!version && entry.version) version = entry.version;
    if (!cwd && entry.cwd) cwd = entry.cwd;

    if (entry.type === "user") {
      userMessageCount += 1;
      turnIndex += 1;
      // Walk user content for tool_result blocks — this is where Claude Code
      // emits tool outcomes (not on the assistant turn). `is_error === true`
      // signals a tool failure we attribute to the originating tool name.
      const userBlocks = (entry as ClaudeUserEntry).message?.content;
      if (Array.isArray(userBlocks)) {
        for (const block of userBlocks) {
          if (block.type === "tool_result") {
            totalToolResults += 1;
            if (block.is_error === true) {
              toolFailures += 1;
              if (toolErrorSink) {
                const id = typeof block.tool_use_id === "string" ? block.tool_use_id : undefined;
                const toolName = id ? toolUseIdToName.get(id) : undefined;
                if (toolName) {
                  toolErrorSink.set(toolName, (toolErrorSink.get(toolName) ?? 0) + 1);
                }
              }
            }
          }
        }
      }
      if (options.includeTurns) {
        const uuid = entry.uuid;
        if (uuid) {
          turnsOut.push({ turnId: uuid });
        }
      }
      continue;
    }

    if (entry.type === "assistant") {
      assistantMessageCount += 1;
      const assistant = entry as ClaudeAssistantEntry;
      const model = assistant.message?.model;
      if (model) {
        if (!firstModel) firstModel = model;
        latestModel = model;
      }

      const turnUsage = normalizeTurnUsage(assistant.message?.usage);
      if (turnUsage) {
        usage.inputTokens += turnUsage.inputTokens;
        usage.outputTokens += turnUsage.outputTokens;
        usage.cacheReadInputTokens += turnUsage.cacheReadInputTokens;
        usage.cacheCreationInputTokens += turnUsage.cacheCreationInputTokens;
        // Running input-token peak reflects how large the prompt grew at this
        // assistant turn; reset on compact_boundary below. Peak across the
        // session is the max observed in any single inter-compaction window.
        const windowInput =
          turnUsage.inputTokens +
          turnUsage.cacheReadInputTokens +
          turnUsage.cacheCreationInputTokens;
        if (windowInput > runningInputPeak) runningInputPeak = windowInput;
        if (runningInputPeak > peakInputTokensBetweenCompactions) {
          peakInputTokensBetweenCompactions = runningInputPeak;
        }
      }

      const turnCost = model && turnUsage ? estimateCostFromUsage(model, turnUsage) : 0;
      estimatedCostUsd += turnCost;

      const turnId = assistant.uuid;
      if (options.includeTurns && turnId) {
        const durationMs = turnDurations.get(turnId);
        turnsOut.push({
          turnId,
          ...(model ? { model } : {}),
          ...(turnUsage ? { usage: turnUsage } : {}),
          ...(turnCost ? { estimatedCostUsd: turnCost } : {}),
          ...(typeof durationMs === "number" ? { turnDurationMs: durationMs } : {}),
        });
      }

      const blocks = assistant.message?.content;
      let toolUsesThisTurn = 0;
      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          classifyBlock(block, toolCounts, flags);
          if (block.type === "tool_use") {
            const name = typeof block.name === "string" ? block.name : "";
            if (!name) continue;
            toolUsesThisTurn += 1;
            totalToolUseBlocks += 1;
            distinctToolNames.add(name);
            if (isMcpTool(name)) mcpToolCalls += 1;
            // Remember the tool_use id so a later tool_result with is_error
            // can be attributed back to this tool name.
            const id = typeof block.id === "string" ? block.id : undefined;
            if (id) toolUseIdToName.set(id, name);
            if (name === "Read") {
              const input = block.input as { readonly file_path?: unknown } | undefined;
              const filePath = typeof input?.file_path === "string" ? input.file_path : undefined;
              if (filePath) {
                readFileCounts.set(filePath, (readFileCounts.get(filePath) ?? 0) + 1);
              }
            }
          }
        }
      }
      if (toolUsesThisTurn >= 1) {
        turnsWithTools += 1;
        if (toolUsesThisTurn === 1) singleToolTurns += 1;
      }
      turnIndex += 1;
      continue;
    }

    if (entry.type === "system") {
      const sys = entry as ClaudeSystemEntry;
      const subtype = (sys as unknown as { subtype?: string }).subtype;
      if (subtype === "compact_boundary") {
        flags.hasCompaction = true;
        const meta =
          (
            sys as unknown as {
              compactMetadata?: { trigger?: string; preTokens?: number };
            }
          ).compactMetadata ?? {};
        const trigger =
          meta.trigger === "auto" ? "auto" : meta.trigger === "manual" ? "manual" : "unknown";
        compactions.push({
          sessionId,
          uuid: sys.uuid ?? "",
          timestamp: sys.timestamp ?? "",
          trigger,
          preTokens: meta.preTokens ?? 0,
          turnIndex,
        });
        // New inter-compaction window begins here; reset running peak but
        // keep `peakInputTokensBetweenCompactions` (max across windows).
        runningInputPeak = 0;
      }
    }
  }

  const model = latestModel ?? firstModel;
  const efficiency: CacheEfficiency = model
    ? cacheEfficiency(model, usage)
    : EMPTY_CACHE_EFFICIENCY;

  const durationMs = startTime && endTime ? Math.max(0, isoDelta(startTime, endTime)) : undefined;

  const cacheDenominator = usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
  const cacheThrashRatio =
    cacheDenominator > 0 ? usage.cacheCreationInputTokens / cacheDenominator : 0;
  const mcpToolCallPct = totalToolUseBlocks > 0 ? mcpToolCalls / totalToolUseBlocks : 0;
  const sequentialToolTurnPct = turnsWithTools > 0 ? singleToolTurns / turnsWithTools : 0;
  const toolFailurePct = totalToolResults > 0 ? toolFailures / totalToolResults : 0;

  const repeatReads: RepeatReadEntry[] = [...readFileCounts.entries()]
    .filter(([, count]) => count >= REPEAT_READ_MIN_COUNT)
    .map(([filePath, count]) => ({ filePath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, REPEAT_READ_TOP_N);

  const waste: SessionWasteSignals = {
    cacheThrashRatio,
    distinctToolCount: distinctToolNames.size,
    mcpToolCallPct,
    sequentialToolTurnPct,
    toolFailurePct,
    peakInputTokensBetweenCompactions,
    bloatWithoutCompaction:
      peakInputTokensBetweenCompactions > BLOAT_WITHOUT_COMPACTION_THRESHOLD &&
      compactions.length === 0,
    repeatReads,
    totalToolUseBlocks,
    totalToolResults,
  };

  return {
    sessionId,
    model,
    usage,
    estimatedCostUsd,
    cacheEfficiency: efficiency,
    toolCounts,
    flags,
    compactions,
    userMessageCount,
    assistantMessageCount,
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(typeof durationMs === "number" ? { durationMs } : {}),
    ...(gitBranch ? { gitBranch } : {}),
    ...(version ? { version } : {}),
    ...(cwd ? { cwd } : {}),
    ...(options.includeTurns ? { turns: turnsOut } : {}),
    waste,
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function classifyBlock(
  block: ClaudeContentBlock,
  toolCounts: Record<string, number>,
  flags: Mutable<SessionDerivedFlags>
): void {
  if (block.type === "thinking") {
    flags.hasThinking = true;
    return;
  }
  if (block.type === "tool_use") {
    const name = typeof block.name === "string" ? (block.name as string) : "";
    if (!name) return;
    toolCounts[name] = (toolCounts[name] ?? 0) + 1;
    const category = categorizeTool(name);
    if (category === "agent") flags.usesTaskAgent = true;
    if (category === "mcp") flags.usesMcp = true;
    if (name === "WebSearch") flags.usesWebSearch = true;
    if (name === "WebFetch") flags.usesWebFetch = true;
  }
}

export function normalizeTurnUsage(raw: ClaudeMessageUsage | undefined): TurnUsage | undefined {
  if (!raw) return undefined;
  const ext = raw as unknown as {
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    };
    service_tier?: string;
    inference_geo?: string;
  };
  return {
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    cacheCreationInputTokens: raw.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: raw.cache_read_input_tokens ?? 0,
    ...(ext.cache_creation?.ephemeral_5m_input_tokens !== undefined
      ? { ephemeral5mInputTokens: ext.cache_creation.ephemeral_5m_input_tokens }
      : {}),
    ...(ext.cache_creation?.ephemeral_1h_input_tokens !== undefined
      ? { ephemeral1hInputTokens: ext.cache_creation.ephemeral_1h_input_tokens }
      : {}),
    ...(ext.service_tier ? { serviceTier: ext.service_tier } : {}),
    ...(ext.inference_geo ? { inferenceGeo: ext.inference_geo } : {}),
  };
}

function firstDefined<R>(
  entries: readonly ClaudeTranscriptEntry[],
  pick: (entry: ClaudeTranscriptEntry) => R | undefined | null
): R | undefined {
  for (const e of entries) {
    const v = pick(e);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function isoDelta(from: string, to: string): number {
  const f = Date.parse(from);
  const t = Date.parse(to);
  if (!Number.isFinite(f) || !Number.isFinite(t)) return 0;
  return t - f;
}

// Intentionally unused export markers for tests / future use. (`ClaudeUserEntry`
// kept as a type reference so contributors see the full entry union.)
export type { ClaudeAssistantEntry, ClaudeRawValue, ClaudeUserEntry };

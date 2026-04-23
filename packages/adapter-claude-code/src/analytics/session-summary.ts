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

import { isToolResultBlock, isToolUseBlock } from "../content-blocks.js";

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

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ─────────────────────────────────────────────────────────────────────────────
// Accumulator state. Kept as a single mutable record so helpers can update
// subsets of it without a 20-argument signature.
// ─────────────────────────────────────────────────────────────────────────────

interface FoldState {
  readonly sessionId: string;
  readonly toolCounts: Record<string, number>;
  readonly usage: Mutable<ModelUsage>;
  readonly flags: Mutable<SessionDerivedFlags>;
  readonly compactions: SessionCompactionEvent[];
  readonly turnsOut: SessionTurnUsage[];
  readonly turnDurations: Map<string, number>;
  readonly distinctToolNames: Set<string>;
  readonly readFileCounts: Map<string, number>;
  readonly toolUseIdToName: Map<string, string>;
  readonly toolErrorSink: Map<string, number> | undefined;
  readonly includeTurns: boolean;
  firstModel: string | null;
  latestModel: string | null;
  estimatedCostUsd: number;
  userMessageCount: number;
  assistantMessageCount: number;
  startTime: string | undefined;
  endTime: string | undefined;
  gitBranch: string | undefined;
  version: string | undefined;
  cwd: string | undefined;
  turnIndex: number;
  totalToolUseBlocks: number;
  totalToolResults: number;
  toolFailures: number;
  mcpToolCalls: number;
  singleToolTurns: number;
  turnsWithTools: number;
  peakInputTokensBetweenCompactions: number;
  runningInputPeak: number;
}

function createFoldState(
  entries: readonly ClaudeTranscriptEntry[],
  options: FoldSessionOptions
): FoldState {
  return {
    sessionId: options.sessionId ?? firstDefined(entries, (e) => e.sessionId) ?? "unknown",
    toolCounts: {},
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
    flags: {
      hasCompaction: false,
      hasThinking: false,
      usesTaskAgent: false,
      usesMcp: false,
      usesWebSearch: false,
      usesWebFetch: false,
    },
    compactions: [],
    turnsOut: [],
    turnDurations: new Map(),
    distinctToolNames: new Set(),
    readFileCounts: new Map(),
    toolUseIdToName: new Map(),
    toolErrorSink: options.toolErrorSink,
    includeTurns: options.includeTurns ?? false,
    firstModel: null,
    latestModel: null,
    estimatedCostUsd: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    startTime: undefined,
    endTime: undefined,
    gitBranch: undefined,
    version: undefined,
    cwd: options.cwd,
    turnIndex: 0,
    totalToolUseBlocks: 0,
    totalToolResults: 0,
    toolFailures: 0,
    mcpToolCalls: 0,
    singleToolTurns: 0,
    turnsWithTools: 0,
    peakInputTokensBetweenCompactions: 0,
    runningInputPeak: 0,
  };
}

/**
 * Derive a canonical `SessionUsageSummary` from raw Claude Code JSONL entries.
 * The returned object is always populated (zero-valued fields when the input
 * is sparse) — callers never need to null-check.
 */
export function foldSessionSummary(
  entries: readonly ClaudeTranscriptEntry[],
  options: FoldSessionOptions = {}
): SessionUsageSummary {
  const state = createFoldState(entries, options);

  // Pass 1: collect turn_duration system events keyed by parentUuid.
  collectTurnDurations(entries, state.turnDurations);

  // Pass 2: accumulate everything else in a single walk.
  for (const entry of entries) {
    updateCommonFields(state, entry);

    if (entry.type === "user") {
      processUserEntry(state, entry as ClaudeUserEntry);
      continue;
    }
    if (entry.type === "assistant") {
      processAssistantEntry(state, entry as ClaudeAssistantEntry);
      continue;
    }
    if (entry.type === "system") {
      processSystemEntry(state, entry as ClaudeSystemEntry);
    }
  }

  return buildSummary(state);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass helpers.
// ─────────────────────────────────────────────────────────────────────────────

function collectTurnDurations(
  entries: readonly ClaudeTranscriptEntry[],
  durations: Map<string, number>
): void {
  for (const entry of entries) {
    if (entry.type !== "system") continue;
    const sys = entry as ClaudeSystemEntry;
    const subtype = (sys as unknown as { subtype?: string }).subtype;
    const parent = sys.parentUuid ?? undefined;
    const durationMs = (sys as unknown as { durationMs?: number }).durationMs;
    if (subtype === "turn_duration" && parent && typeof durationMs === "number") {
      durations.set(parent, durationMs);
    }
  }
}

function updateCommonFields(state: FoldState, entry: ClaudeTranscriptEntry): void {
  state.startTime ??= entry.timestamp;
  if (entry.timestamp) state.endTime = entry.timestamp;
  if (!state.gitBranch && entry.gitBranch && entry.gitBranch !== "HEAD") {
    state.gitBranch = entry.gitBranch;
  }
  state.version ??= entry.version;
  state.cwd ??= entry.cwd;
}

function processUserEntry(state: FoldState, entry: ClaudeUserEntry): void {
  state.userMessageCount += 1;
  state.turnIndex += 1;

  const userBlocks = entry.message?.content;
  if (Array.isArray(userBlocks)) {
    const blocks: readonly ClaudeContentBlock[] = userBlocks;
    for (const block of blocks) {
      if (!isToolResultBlock(block)) continue;
      state.totalToolResults += 1;
      if (block.is_error === true) {
        state.toolFailures += 1;
        recordToolError(state, block.tool_use_id);
      }
    }
  }

  if (state.includeTurns && entry.uuid) {
    state.turnsOut.push({ turnId: entry.uuid });
  }
}

function recordToolError(state: FoldState, toolUseId: string): void {
  if (!state.toolErrorSink) return;
  const toolName = state.toolUseIdToName.get(toolUseId);
  if (!toolName) return;
  state.toolErrorSink.set(toolName, (state.toolErrorSink.get(toolName) ?? 0) + 1);
}

function processAssistantEntry(state: FoldState, assistant: ClaudeAssistantEntry): void {
  state.assistantMessageCount += 1;

  const model = assistant.message?.model;
  recordAssistantModel(state, model);

  const turnUsage = normalizeTurnUsage(assistant.message?.usage);
  if (turnUsage) accumulateUsage(state, turnUsage);

  const turnCost = model && turnUsage ? estimateCostFromUsage(model, turnUsage) : 0;
  state.estimatedCostUsd += turnCost;

  emitTurnUsage(state, assistant.uuid, model, turnUsage, turnCost);

  const blocks = assistant.message?.content;
  const toolUsesThisTurn = Array.isArray(blocks) ? processAssistantBlocks(state, blocks) : 0;
  if (toolUsesThisTurn >= 1) {
    state.turnsWithTools += 1;
    if (toolUsesThisTurn === 1) state.singleToolTurns += 1;
  }
  state.turnIndex += 1;
}

function recordAssistantModel(state: FoldState, model: string | undefined): void {
  if (!model) return;
  state.firstModel ??= model;
  state.latestModel = model;
}

function emitTurnUsage(
  state: FoldState,
  turnId: string | undefined,
  model: string | undefined,
  turnUsage: TurnUsage | undefined,
  turnCost: number
): void {
  if (!state.includeTurns || !turnId) return;
  const durationMs = state.turnDurations.get(turnId);
  state.turnsOut.push({
    turnId,
    ...(model ? { model } : {}),
    ...(turnUsage ? { usage: turnUsage } : {}),
    ...(turnCost ? { estimatedCostUsd: turnCost } : {}),
    ...(typeof durationMs === "number" ? { turnDurationMs: durationMs } : {}),
  });
}

function accumulateUsage(state: FoldState, turnUsage: TurnUsage): void {
  state.usage.inputTokens += turnUsage.inputTokens;
  state.usage.outputTokens += turnUsage.outputTokens;
  state.usage.cacheReadInputTokens += turnUsage.cacheReadInputTokens;
  state.usage.cacheCreationInputTokens += turnUsage.cacheCreationInputTokens;
  // Running input-token peak reflects how large the prompt grew at this
  // assistant turn; reset on compact_boundary in processSystemEntry. Peak
  // across the session is the max observed in any single inter-compaction
  // window.
  const windowInput =
    turnUsage.inputTokens + turnUsage.cacheReadInputTokens + turnUsage.cacheCreationInputTokens;
  if (windowInput > state.runningInputPeak) state.runningInputPeak = windowInput;
  if (state.runningInputPeak > state.peakInputTokensBetweenCompactions) {
    state.peakInputTokensBetweenCompactions = state.runningInputPeak;
  }
}

function processAssistantBlocks(state: FoldState, blocks: readonly ClaudeContentBlock[]): number {
  let toolUsesThisTurn = 0;
  for (const block of blocks) {
    classifyBlock(block, state.toolCounts, state.flags);
    if (!isToolUseBlock(block)) continue;
    const name = block.name;
    if (!name) continue;
    toolUsesThisTurn += 1;
    state.totalToolUseBlocks += 1;
    state.distinctToolNames.add(name);
    if (isMcpTool(name)) state.mcpToolCalls += 1;
    // Remember the tool_use id so a later tool_result with is_error can be
    // attributed back to this tool name.
    state.toolUseIdToName.set(block.id, name);
    if (name === "Read") recordReadFilePath(state, block.input);
  }
  return toolUsesThisTurn;
}

function recordReadFilePath(state: FoldState, input: ClaudeRawValue): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return;
  const filePath = (input as { readonly file_path?: ClaudeRawValue }).file_path;
  if (typeof filePath !== "string") return;
  state.readFileCounts.set(filePath, (state.readFileCounts.get(filePath) ?? 0) + 1);
}

function processSystemEntry(state: FoldState, sys: ClaudeSystemEntry): void {
  const subtype = (sys as unknown as { subtype?: string }).subtype;
  if (subtype !== "compact_boundary") return;

  state.flags.hasCompaction = true;
  const meta =
    (
      sys as unknown as {
        compactMetadata?: { trigger?: string; preTokens?: number };
      }
    ).compactMetadata ?? {};
  const trigger =
    meta.trigger === "auto" ? "auto" : meta.trigger === "manual" ? "manual" : "unknown";
  state.compactions.push({
    sessionId: state.sessionId,
    uuid: sys.uuid ?? "",
    timestamp: sys.timestamp ?? "",
    trigger,
    preTokens: meta.preTokens ?? 0,
    turnIndex: state.turnIndex,
  });
  // New inter-compaction window begins here; reset running peak but keep
  // `peakInputTokensBetweenCompactions` (max across windows).
  state.runningInputPeak = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Final projection.
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(state: FoldState): SessionUsageSummary {
  const model = state.latestModel ?? state.firstModel;
  const efficiency: CacheEfficiency = model
    ? cacheEfficiency(model, state.usage)
    : EMPTY_CACHE_EFFICIENCY;

  const durationMs =
    state.startTime && state.endTime
      ? Math.max(0, isoDelta(state.startTime, state.endTime))
      : undefined;

  return {
    sessionId: state.sessionId,
    model,
    usage: state.usage,
    estimatedCostUsd: state.estimatedCostUsd,
    cacheEfficiency: efficiency,
    toolCounts: state.toolCounts,
    flags: state.flags,
    compactions: state.compactions,
    userMessageCount: state.userMessageCount,
    assistantMessageCount: state.assistantMessageCount,
    ...buildSummaryOptionalFields(state, durationMs),
    waste: buildWasteSignals(state),
  };
}

function buildSummaryOptionalFields(
  state: FoldState,
  durationMs: number | undefined
): Partial<SessionUsageSummary> {
  return {
    ...(state.startTime ? { startTime: state.startTime } : {}),
    ...(state.endTime ? { endTime: state.endTime } : {}),
    ...(typeof durationMs === "number" ? { durationMs } : {}),
    ...(state.gitBranch ? { gitBranch: state.gitBranch } : {}),
    ...(state.version ? { version: state.version } : {}),
    ...(state.cwd ? { cwd: state.cwd } : {}),
    ...(state.includeTurns ? { turns: state.turnsOut } : {}),
  };
}

function buildWasteSignals(state: FoldState): SessionWasteSignals {
  const cacheDenominator = state.usage.cacheCreationInputTokens + state.usage.cacheReadInputTokens;
  const cacheThrashRatio =
    cacheDenominator > 0 ? state.usage.cacheCreationInputTokens / cacheDenominator : 0;
  const mcpToolCallPct =
    state.totalToolUseBlocks > 0 ? state.mcpToolCalls / state.totalToolUseBlocks : 0;
  const sequentialToolTurnPct =
    state.turnsWithTools > 0 ? state.singleToolTurns / state.turnsWithTools : 0;
  const toolFailurePct =
    state.totalToolResults > 0 ? state.toolFailures / state.totalToolResults : 0;

  const repeatReads: RepeatReadEntry[] = [...state.readFileCounts.entries()]
    .filter(([, count]) => count >= REPEAT_READ_MIN_COUNT)
    .map(([filePath, count]) => ({ filePath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, REPEAT_READ_TOP_N);

  return {
    cacheThrashRatio,
    distinctToolCount: state.distinctToolNames.size,
    mcpToolCallPct,
    sequentialToolTurnPct,
    toolFailurePct,
    peakInputTokensBetweenCompactions: state.peakInputTokensBetweenCompactions,
    bloatWithoutCompaction:
      state.peakInputTokensBetweenCompactions > BLOAT_WITHOUT_COMPACTION_THRESHOLD &&
      state.compactions.length === 0,
    repeatReads,
    totalToolUseBlocks: state.totalToolUseBlocks,
    totalToolResults: state.totalToolResults,
  };
}

function classifyBlock(
  block: ClaudeContentBlock,
  toolCounts: Record<string, number>,
  flags: Mutable<SessionDerivedFlags>
): void {
  if (block.type === "thinking") {
    flags.hasThinking = true;
    return;
  }
  if (!isToolUseBlock(block)) return;
  const name = block.name;
  if (!name) return;
  toolCounts[name] = (toolCounts[name] ?? 0) + 1;
  const category = categorizeTool(name);
  if (category === "agent") flags.usesTaskAgent = true;
  if (category === "mcp") flags.usesMcp = true;
  if (name === "WebSearch") flags.usesWebSearch = true;
  if (name === "WebFetch") flags.usesWebFetch = true;
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
    ...extractEphemeralTokens(ext.cache_creation),
    ...extractUsageTags(ext),
  };
}

function extractEphemeralTokens(
  cacheCreation:
    | { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
    | undefined
): Partial<Pick<TurnUsage, "ephemeral5mInputTokens" | "ephemeral1hInputTokens">> {
  const ephemeral5m = cacheCreation?.ephemeral_5m_input_tokens;
  const ephemeral1h = cacheCreation?.ephemeral_1h_input_tokens;
  return {
    ...(ephemeral5m !== undefined ? { ephemeral5mInputTokens: ephemeral5m } : {}),
    ...(ephemeral1h !== undefined ? { ephemeral1hInputTokens: ephemeral1h } : {}),
  };
}

function extractUsageTags(ext: {
  service_tier?: string;
  inference_geo?: string;
}): Partial<Pick<TurnUsage, "serviceTier" | "inferenceGeo">> {
  return {
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

// Adapted from cc-lens (Arindam200/cc-lens, MIT) `lib/replay-parser.ts`.
// The fold is a straight port; the output is typed in canonical
// `@control-plane/core` shapes (`ReplayData`, `ReplayTurn`, etc.) rather than
// cc-lens's adapter-specific types. I/O is hoisted out: the caller passes
// raw entries in.
import {
  estimateCostFromUsage,
  type ReplayCompactionEvent,
  type ReplayData,
  type ReplaySummaryEvent,
  type ReplayToolCall,
  type ReplayToolResult,
  type ReplayTurn,
  type TurnUsage,
} from "@control-plane/core";

import {
  isTextBlock,
  isThinkingBlock,
  isToolResultBlock,
  isToolUseBlock,
} from "../content-blocks.js";

import { normalizeTurnUsage } from "./session-summary.js";

import type {
  ClaudeAssistantEntry,
  ClaudeContentBlock,
  ClaudeRawValue,
  ClaudeSystemEntry,
  ClaudeTranscriptEntry,
  ClaudeUserEntry,
} from "../types.js";

export interface ReplayFoldOptions {
  readonly sessionId?: string;
  readonly toolResultPreviewLimit?: number;
}

interface ReplayState {
  readonly limit: number;
  readonly turns: ReplayTurn[];
  readonly compactions: ReplayCompactionEvent[];
  readonly summaries: ReplaySummaryEvent[];
  readonly turnDurations: Map<string, number>;
  slug: string | undefined;
  version: string | undefined;
  gitBranch: string | undefined;
  sessionId: string | undefined;
  totalCostUsd: number;
  turnIndex: number;
  lastAssistantTs: number | undefined;
}

export function foldReplay(
  entries: readonly ClaudeTranscriptEntry[],
  options: ReplayFoldOptions = {}
): ReplayData {
  const state: ReplayState = {
    limit: Math.max(0, options.toolResultPreviewLimit ?? 2000),
    turns: [],
    compactions: [],
    summaries: [],
    turnDurations: new Map(),
    slug: undefined,
    version: undefined,
    gitBranch: undefined,
    sessionId: options.sessionId,
    totalCostUsd: 0,
    turnIndex: 0,
    lastAssistantTs: undefined,
  };

  // Pass 1: metadata + turn-duration events.
  collectMetadata(entries, state);

  // Pass 2: build the replay stream.
  for (const entry of entries) {
    processReplayEntry(entry, state);
  }

  return {
    sessionId: state.sessionId ?? "unknown",
    ...(state.slug ? { slug: state.slug } : {}),
    ...(state.version ? { version: state.version } : {}),
    ...(state.gitBranch ? { gitBranch: state.gitBranch } : {}),
    turns: state.turns,
    compactions: state.compactions,
    summaries: state.summaries,
    totalCostUsd: state.totalCostUsd,
  };
}

function collectMetadata(entries: readonly ClaudeTranscriptEntry[], state: ReplayState): void {
  for (const entry of entries) {
    collectTurnDurationFromSystem(entry, state);
    collectMetadataFields(entry, state);
  }
}

function collectTurnDurationFromSystem(entry: ClaudeTranscriptEntry, state: ReplayState): void {
  if (entry.type !== "system") return;
  const sys = entry as ClaudeSystemEntry;
  const subtype = (sys as unknown as { subtype?: string }).subtype;
  if (subtype !== "turn_duration") return;
  const parent = sys.parentUuid ?? undefined;
  const duration = (sys as unknown as { durationMs?: number }).durationMs;
  if (parent && typeof duration === "number") state.turnDurations.set(parent, duration);
}

function collectMetadataFields(entry: ClaudeTranscriptEntry, state: ReplayState): void {
  state.sessionId ??= entry.sessionId;
  const slug = (entry as unknown as { slug?: string }).slug;
  if (!state.slug && slug) state.slug = slug;
  state.version ??= entry.version;
  if (!state.gitBranch && entry.gitBranch && entry.gitBranch !== "HEAD") {
    state.gitBranch = entry.gitBranch;
  }
}

function processReplayEntry(entry: ClaudeTranscriptEntry, state: ReplayState): void {
  if (entry.type === "summary") {
    const s = entry as { uuid?: string; summary?: string; leafUuid?: string };
    state.summaries.push({
      uuid: s.uuid ?? "",
      summary: s.summary ?? "",
      leafUuid: s.leafUuid ?? "",
    });
    return;
  }

  if (entry.type === "system") {
    processCompactionBoundary(entry as ClaudeSystemEntry, state);
    return;
  }

  if (entry.type === "user") {
    processReplayUserEntry(entry as ClaudeUserEntry, state);
    state.turnIndex += 1;
    return;
  }

  if (entry.type === "assistant") {
    processReplayAssistantEntry(entry as ClaudeAssistantEntry, state);
    state.turnIndex += 1;
  }
}

function processCompactionBoundary(sys: ClaudeSystemEntry, state: ReplayState): void {
  const subtype = (sys as unknown as { subtype?: string }).subtype;
  if (subtype !== "compact_boundary") return;

  const meta =
    (
      sys as unknown as {
        compactMetadata?: { trigger?: string; preTokens?: number };
      }
    ).compactMetadata ?? {};
  const trigger = resolveCompactionTrigger(meta.trigger);
  const resolvedSummary = resolveCompactionSummary(sys, state);
  state.compactions.push({
    uuid: sys.uuid ?? "",
    timestamp: sys.timestamp ?? "",
    trigger,
    preTokens: meta.preTokens ?? 0,
    turnIndex: state.turnIndex,
    ...(resolvedSummary !== undefined ? { summary: resolvedSummary } : {}),
  });
}

function resolveCompactionTrigger(trigger: string | undefined): "auto" | "manual" | "unknown" {
  if (trigger === "auto") return "auto";
  if (trigger === "manual") return "manual";
  return "unknown";
}

function resolveCompactionSummary(sys: ClaudeSystemEntry, state: ReplayState): string | undefined {
  const direct = (sys as unknown as { content?: unknown }).content;
  if (typeof direct === "string") return direct;
  if (state.summaries.length > 0) return state.summaries[state.summaries.length - 1]?.summary;
  return undefined;
}

interface UserContent {
  readonly text: string;
  readonly toolResults: ReplayToolResult[];
}

function extractUserContent(
  content: string | readonly ClaudeContentBlock[] | undefined,
  limit: number
): UserContent {
  if (typeof content === "string") {
    return { text: content, toolResults: [] };
  }
  if (!Array.isArray(content)) {
    return { text: "", toolResults: [] };
  }
  // Re-assert readonly element type: `Array.isArray` narrows to `any[]` and
  // collapses the `readonly ClaudeContentBlock[]` shape, defeating the guards.
  const blocks: readonly ClaudeContentBlock[] = content;
  let text = "";
  const toolResults: ReplayToolResult[] = [];
  for (const block of blocks) {
    if (isTextBlock(block)) text += block.text;
    if (isToolResultBlock(block)) {
      toolResults.push({
        toolUseId: block.tool_use_id,
        content: toolResultPreview(block.content, limit),
        isError: block.is_error === true,
      });
    }
  }
  return { text, toolResults };
}

function processReplayUserEntry(user: ClaudeUserEntry, state: ReplayState): void {
  const { text, toolResults } = extractUserContent(user.message?.content, state.limit);

  state.turns.push({
    uuid: user.uuid ?? "",
    parentUuid: user.parentUuid ?? null,
    type: "user",
    timestamp: user.timestamp ?? "",
    text: text.trim(),
    ...(toolResults.length > 0 ? { toolResults } : {}),
  });
}

interface AssistantContent {
  readonly text: string;
  readonly hasThinking: boolean;
  readonly thinkingText: string;
  readonly toolCalls: ReplayToolCall[];
}

function extractAssistantContent(content: readonly ClaudeContentBlock[]): AssistantContent {
  let text = "";
  let hasThinking = false;
  let thinkingText = "";
  const toolCalls: ReplayToolCall[] = [];

  for (const block of content) {
    if (isTextBlock(block)) text += block.text;
    if (isThinkingBlock(block)) {
      hasThinking = true;
      thinkingText += block.thinking;
    }
    if (isToolUseBlock(block)) {
      toolCalls.push({
        id: block.id,
        name: block.name,
        // `ClaudeRawValue` is structurally a subset of `JsonValue`
        // (primitives + nested records/arrays) — TypeScript accepts the
        // assignment directly since both unions canonicalize the same way.
        input: block.input,
      });
    }
  }

  return { text, hasThinking, thinkingText, toolCalls };
}

const EMPTY_ASSISTANT_CONTENT: AssistantContent = {
  text: "",
  hasThinking: false,
  thinkingText: "",
  toolCalls: [],
};

function computeResponseTimeSec(ts: number, state: ReplayState): number | undefined {
  if (!Number.isFinite(ts) || state.lastAssistantTs === undefined) return undefined;
  return Math.max(0, (ts - state.lastAssistantTs) / 1000);
}

function resolveAssistantContent(
  raw: string | readonly ClaudeContentBlock[] | undefined
): AssistantContent {
  if (!Array.isArray(raw)) return EMPTY_ASSISTANT_CONTENT;
  // Re-assert readonly element type after Array.isArray narrowing.
  const blocks: readonly ClaudeContentBlock[] = raw;
  return extractAssistantContent(blocks);
}

function buildAssistantOptionalFields(
  model: string | undefined,
  usage: TurnUsage | undefined,
  content: AssistantContent,
  durationMs: number | undefined,
  responseTimeSec: number | undefined
): Partial<ReplayTurn> {
  const trimmedThinking = content.thinkingText.trim();
  return {
    ...(model ? { model } : {}),
    ...(usage ? { usage } : {}),
    ...(content.toolCalls.length > 0 ? { toolCalls: content.toolCalls } : {}),
    ...(trimmedThinking ? { thinkingText: trimmedThinking } : {}),
    ...(typeof durationMs === "number" ? { turnDurationMs: durationMs } : {}),
    ...(typeof responseTimeSec === "number" ? { responseTimeSec } : {}),
  };
}

function advanceResponseTiming(
  assistant: ClaudeAssistantEntry,
  state: ReplayState
): number | undefined {
  const ts = assistant.timestamp ? Date.parse(assistant.timestamp) : Number.NaN;
  const responseTimeSec = computeResponseTimeSec(ts, state);
  if (Number.isFinite(ts)) state.lastAssistantTs = ts;
  return responseTimeSec;
}

function processReplayAssistantEntry(assistant: ClaudeAssistantEntry, state: ReplayState): void {
  const msg = assistant.message;
  const usage: TurnUsage | undefined = normalizeTurnUsage(msg?.usage);
  const model = msg?.model;
  const content = resolveAssistantContent(msg?.content);

  const estimated = model && usage ? estimateCostFromUsage(model, usage) : 0;
  state.totalCostUsd += estimated;
  const durationMs = assistant.uuid ? state.turnDurations.get(assistant.uuid) : undefined;
  const responseTimeSec = advanceResponseTiming(assistant, state);

  state.turns.push({
    uuid: assistant.uuid ?? "",
    parentUuid: assistant.parentUuid ?? null,
    type: "assistant",
    timestamp: assistant.timestamp ?? "",
    text: content.text.trim(),
    hasThinking: content.hasThinking,
    estimatedCostUsd: estimated,
    ...buildAssistantOptionalFields(model, usage, content, durationMs, responseTimeSec),
  });
}

function toolResultPreview(raw: ClaudeRawValue | undefined, limit: number): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") return raw.slice(0, limit);
  if (Array.isArray(raw)) {
    const joined = raw.map(stringifyToolResultItem).join("");
    return joined.slice(0, limit);
  }
  if (typeof raw === "object") {
    const rec = raw as { text?: unknown };
    if (typeof rec.text === "string") return rec.text.slice(0, limit);
    try {
      return JSON.stringify(raw).slice(0, limit);
    } catch {
      return "";
    }
  }
  // Primitive number/boolean.
  return String(raw).slice(0, limit);
}

function stringifyToolResultItem(value: ClaudeRawValue): string {
  if (typeof value === "string") return value;
  if (value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  const rec = value as { text?: unknown };
  if (typeof rec.text === "string") return rec.text;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

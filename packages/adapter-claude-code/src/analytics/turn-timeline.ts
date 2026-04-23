import { normalizeTurnUsage } from "./session-summary.js";

import type {
  ClaudeAssistantEntry,
  ClaudeContentBlock,
  ClaudeSystemEntry,
  ClaudeTranscriptEntry,
  ClaudeUserEntry,
} from "../types.js";

/**
 * Pure fold: given the raw transcript entries for a single session, emit a
 * per-turn timeline. Designed to answer questions like "which turn caused the
 * spiral?" and "did the failure cluster on one assistant turn?" — the existing
 * session-level rollups in `session-summary.ts` hide that detail.
 *
 * No I/O, no clocks, no caching. Inputs flow in, the canonical output flows
 * out. The adapter is responsible for loading `entries` from disk.
 */

export interface TurnTimelineEntry {
  readonly turnIndex: number;
  readonly role: "user" | "assistant" | "system";
  /** Tool names used on this turn, in order, with repeats. */
  readonly toolsUsed: readonly string[];
  /** `tool_result` blocks on this turn with `is_error === true`. */
  readonly toolFailures: number;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  /**
   * `cacheRead / (cacheRead + cacheCreation)`. `0` when both are zero.
   * A low value at a specific turn signals a local cache miss / schema churn.
   */
  readonly cacheHitRate: number;
  readonly outputTokens: number;
  /**
   * Milliseconds for this turn, sourced from the matching `system`
   * `turn_duration` event (keyed by `parentUuid`). `null` when Claude Code did
   * not emit a duration for the turn.
   */
  readonly durationMs: number | null;
  /**
   * Heuristic: `role === "assistant"` AND zero tool uses AND text content
   * (after trimming whitespace) under 20 chars. Catches "..." / "ok" / empty
   * assistant turns that the model emits when spiraling. Not a contract — this
   * heuristic is tuned for the current scorer and may be refined as patterns
   * emerge.
   */
  readonly wastedTurn: boolean;
  readonly timestamp: string | null;
}

export interface TurnTimeline {
  readonly sessionId: string;
  readonly entries: readonly TurnTimelineEntry[];
}

export interface TurnTimelineFoldOptions {
  readonly sessionId?: string;
}

/** Text length (whitespace-stripped) under which an assistant turn with no tool_use is considered wasted. */
const WASTED_TURN_TEXT_THRESHOLD = 20;

export function computeTurnTimeline(
  entries: readonly ClaudeTranscriptEntry[],
  options: TurnTimelineFoldOptions = {}
): TurnTimeline {
  const sessionId =
    options.sessionId ?? firstDefined(entries, (entry) => entry.sessionId) ?? "unknown";

  // Pass 1 — collect `turn_duration` events keyed by `parentUuid` so they can
  // be attached to the matching assistant turn in pass 2.
  const durations = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== "system") continue;
    const sys = entry as ClaudeSystemEntry;
    const subtype = (sys as unknown as { subtype?: string }).subtype;
    const durationMs = (sys as unknown as { durationMs?: number }).durationMs;
    const parent = sys.parentUuid ?? undefined;
    if (subtype === "turn_duration" && parent && typeof durationMs === "number") {
      durations.set(parent, durationMs);
    }
  }

  const timeline: TurnTimelineEntry[] = [];
  let turnIndex = 0;

  for (const entry of entries) {
    if (entry.type === "user") {
      timeline.push(buildUserEntry(entry as ClaudeUserEntry, turnIndex));
      turnIndex += 1;
      continue;
    }
    if (entry.type === "assistant") {
      timeline.push(buildAssistantEntry(entry as ClaudeAssistantEntry, turnIndex, durations));
      turnIndex += 1;
    }
    // `system` / `summary` / `attachment` / unknown entries aren't user-visible
    // turns, so we skip them here. `turn_duration` system events are consumed
    // above as durations, not emitted as their own rows.
  }

  return { sessionId, entries: timeline };
}

function buildUserEntry(entry: ClaudeUserEntry, turnIndex: number): TurnTimelineEntry {
  const content = entry.message?.content;
  let toolFailures = 0;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "tool_result" && block.is_error === true) {
        toolFailures += 1;
      }
    }
  }
  return {
    turnIndex,
    role: "user",
    toolsUsed: [],
    toolFailures,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheHitRate: 0,
    outputTokens: 0,
    durationMs: null,
    wastedTurn: false,
    timestamp: entry.timestamp ?? null,
  };
}

function buildAssistantEntry(
  entry: ClaudeAssistantEntry,
  turnIndex: number,
  durations: Map<string, number>
): TurnTimelineEntry {
  const usage = normalizeTurnUsage(entry.message?.usage);
  const content = entry.message?.content;
  const toolsUsed: string[] = [];
  let textLen = 0;

  if (Array.isArray(content)) {
    for (const block of content) {
      collectToolsAndText(block, toolsUsed, (addedLen) => {
        textLen += addedLen;
      });
    }
  } else if (typeof content === "string") {
    textLen += content.replace(/\s+/g, "").length;
  }

  const inputTokens = usage?.inputTokens ?? 0;
  const cacheReadTokens = usage?.cacheReadInputTokens ?? 0;
  const cacheCreationTokens = usage?.cacheCreationInputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const cacheDenom = cacheReadTokens + cacheCreationTokens;
  const cacheHitRate = cacheDenom > 0 ? cacheReadTokens / cacheDenom : 0;

  const uuid = entry.uuid;
  const durationMs = uuid ? (durations.get(uuid) ?? null) : null;

  const wastedTurn = toolsUsed.length === 0 && textLen < WASTED_TURN_TEXT_THRESHOLD;

  return {
    turnIndex,
    role: "assistant",
    toolsUsed,
    toolFailures: 0,
    inputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    cacheHitRate,
    outputTokens,
    durationMs,
    wastedTurn,
    timestamp: entry.timestamp ?? null,
  };
}

function collectToolsAndText(
  block: ClaudeContentBlock,
  toolsUsed: string[],
  addText: (len: number) => void
): void {
  if (block.type === "tool_use") {
    const name = typeof block.name === "string" ? block.name : "";
    if (name) toolsUsed.push(name);
    return;
  }
  if (block.type === "text" && typeof block.text === "string") {
    addText(block.text.replace(/\s+/g, "").length);
    return;
  }
  if (block.type === "thinking" && typeof (block as { thinking?: unknown }).thinking === "string") {
    // Thinking blocks are distinct from user-visible text. Don't count them
    // toward the "wasted turn" threshold — an internal-monologue-only turn
    // still did real work even if no tool_use came out of it.
    return;
  }
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

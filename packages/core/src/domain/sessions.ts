import type { AgentRuntime } from "./agents.js";
import type { ChannelRef } from "./channels.js";
import type { JsonObject, JsonValue, MetadataCarrier } from "./common.js";
import type { CacheEfficiency, ModelUsage, TurnUsage } from "./costs.js";
import type { ToolCall, ToolResult } from "./tools.js";

export const SESSION_STATES = {
  Created: "created",
  Running: "running",
  WaitingForInput: "waiting_for_input",
  Paused: "paused",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;

export type SessionState = (typeof SESSION_STATES)[keyof typeof SESSION_STATES];

export const SESSION_ACTOR_ROLES = {
  User: "user",
  Agent: "agent",
  Tool: "tool",
  System: "system",
} as const;

export type SessionActorRole = (typeof SESSION_ACTOR_ROLES)[keyof typeof SESSION_ACTOR_ROLES];

export interface SessionDescriptor extends MetadataCarrier {
  readonly id: string;
  readonly agentId: string;
  readonly runtime: AgentRuntime;
  readonly state: SessionState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly title?: string;
  readonly channel?: ChannelRef;
  readonly externalRef?: string;
}

export interface SessionActor {
  readonly role: SessionActorRole;
  readonly id?: string;
  readonly displayName?: string;
}

export type SessionContent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "json"; readonly value: JsonValue }
  | { readonly kind: "tool_call"; readonly call: ToolCall }
  | { readonly kind: "tool_result"; readonly result: ToolResult };

export interface SessionTurn extends MetadataCarrier {
  readonly id: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly actor: SessionActor;
  readonly content: SessionContent;
  readonly createdAt: string;
  readonly correlationId?: string;
}

export interface SessionStateTransition {
  readonly sessionId: string;
  readonly from: SessionState;
  readonly to: SessionState;
  readonly changedAt: string;
  readonly reason?: string;
  readonly context?: JsonObject;
}

// ─── Phase 1 Wave 0: sessions-superset additions ──────────────────────────────
// Derived, adapter-agnostic views over a single session. All purely additive —
// existing consumers that only read `SessionDescriptor` / `SessionTurn` keep
// working unchanged.

/**
 * Boolean feature flags derived from scanning a full session transcript.
 * Every field is true iff the session contains at least one matching event.
 */
export interface SessionDerivedFlags {
  readonly hasCompaction: boolean;
  readonly hasThinking: boolean;
  readonly usesTaskAgent: boolean;
  readonly usesMcp: boolean;
  readonly usesWebSearch: boolean;
  readonly usesWebFetch: boolean;
}

export const COMPACTION_TRIGGERS = {
  Auto: "auto",
  Manual: "manual",
  Unknown: "unknown",
} as const;

export type CompactionTrigger = (typeof COMPACTION_TRIGGERS)[keyof typeof COMPACTION_TRIGGERS];

/**
 * Canonical view of a compaction boundary inside a session. Claude Code emits
 * these as `type: "system", subtype: "compact_boundary"` lines.
 */
export interface SessionCompactionEvent {
  readonly sessionId: string;
  readonly uuid: string;
  readonly timestamp: string;
  readonly trigger: CompactionTrigger;
  readonly preTokens: number;
  readonly turnIndex: number;
  readonly summary?: string;
}

/**
 * Per-turn usage view, keyed by the originating assistant turn's id. Produced
 * by the analytics layer; `usage`/`model`/cost may all be absent on a turn
 * that is not an assistant message (e.g. user or system turn).
 */
export interface SessionTurnUsage {
  readonly turnId: string;
  readonly model?: string;
  readonly usage?: TurnUsage;
  readonly estimatedCostUsd?: number;
  readonly turnDurationMs?: number;
}

/**
 * Rolled-up canonical summary for a single session. Callers get tokens, cost,
 * cache efficiency, tool counts, feature flags, and the list of compaction
 * events in one stable shape.
 */
export interface SessionUsageSummary {
  readonly sessionId: string;
  readonly model: string | null;
  readonly usage: ModelUsage;
  readonly estimatedCostUsd: number;
  readonly cacheEfficiency: CacheEfficiency;
  readonly toolCounts: Readonly<Record<string, number>>;
  readonly flags: SessionDerivedFlags;
  readonly compactions: readonly SessionCompactionEvent[];
  readonly startTime?: string;
  readonly endTime?: string;
  readonly durationMs?: number;
  readonly userMessageCount: number;
  readonly assistantMessageCount: number;
  readonly gitBranch?: string;
  readonly version?: string;
  readonly cwd?: string;
  readonly turns?: readonly SessionTurnUsage[];
  readonly waste?: SessionWasteSignals;
}

// ─── Waste signals ────────────────────────────────────────────────────────────
// Per-session derived metrics that quantify common inefficiency patterns. All
// optional on SessionUsageSummary so existing fixtures remain valid; populated
// by the analytics layer on a full fold.

export interface RepeatReadEntry {
  readonly filePath: string;
  readonly count: number;
}

/**
 * Raw, dimensional metrics. Kept unbounded (not pre-normalized to 0..1) so
 * scorers can combine them with tunable thresholds. Interpret zeros as
 * "no evidence" — e.g. a session with zero assistant turns that used tools
 * has `sequentialToolTurnPct === 0` by construction.
 */
export interface SessionWasteSignals {
  /** cacheCreation / (cacheCreation + cacheRead). High = thrashing prefix. */
  readonly cacheThrashRatio: number;
  /** Number of distinct tool names used in the session. */
  readonly distinctToolCount: number;
  /** MCP tool calls / total tool calls. */
  readonly mcpToolCallPct: number;
  /** Assistant turns with exactly 1 tool_use / assistant turns with ≥1 tool_use. */
  readonly sequentialToolTurnPct: number;
  /** tool_result blocks with is_error=true / total tool_result blocks. */
  readonly toolFailurePct: number;
  /** Peak running input-token count observed between compaction boundaries. */
  readonly peakInputTokensBetweenCompactions: number;
  /** True when peak input exceeded 150k and no compaction event was observed. */
  readonly bloatWithoutCompaction: boolean;
  /** Files read ≥3 times, sorted desc by count. Bounded to top 10. */
  readonly repeatReads: readonly RepeatReadEntry[];
  /** Total assistant tool_use blocks counted. */
  readonly totalToolUseBlocks: number;
  /** Total tool_result blocks counted. */
  readonly totalToolResults: number;
}

/**
 * Normalized 0..1 waste sub-scores. Each dimension is mapped from the raw
 * signals using a documented threshold set (see `scoreSessionWaste`).
 */
export interface WasteScores {
  readonly cacheThrash: number;
  readonly toolPollution: number;
  readonly sequentialTools: number;
  readonly toolHammering: number;
  readonly contextBloat: number;
  readonly compactionAbsence: number;
}

/**
 * Per-session verdict: scores + human-readable flags quoting the evidence
 * (verbatim file paths, tool names, ratios). Flags are intentionally short
 * strings so a report can list them without further parsing.
 */
export interface WasteVerdict {
  readonly sessionId: string;
  readonly scores: WasteScores;
  readonly overall: number;
  readonly flags: readonly string[];
}

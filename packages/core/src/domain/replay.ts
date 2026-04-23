import type { JsonObject, JsonValue, MetadataCarrier } from "./common.js";
import type { TurnUsage } from "./costs.js";
import type { DomainEventEnvelope } from "./events.js";
import type { CompactionTrigger } from "./sessions.js";

export const REPLAY_MODES = {
  DryRun: "dry_run",
  Deterministic: "deterministic",
  LiveAdapters: "live_adapters"
} as const;

export type ReplayMode = (typeof REPLAY_MODES)[keyof typeof REPLAY_MODES];

export type ReplaySource =
  | { readonly kind: "session"; readonly sessionId: string }
  | { readonly kind: "event_range"; readonly fromCursor?: string; readonly toCursor?: string }
  | { readonly kind: "events"; readonly events: readonly DomainEventEnvelope[] };

export interface ReplayRequest extends MetadataCarrier {
  readonly id: string;
  readonly source: ReplaySource;
  readonly mode: ReplayMode;
  readonly requestedAt: string;
  readonly adapterOverrides?: JsonObject;
}

export interface ReplayFrame {
  readonly sequence: number;
  readonly at: string;
  readonly event: DomainEventEnvelope;
  readonly state?: JsonValue;
}

export interface ReplayResult extends MetadataCarrier {
  readonly requestId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly frames: readonly ReplayFrame[];
  readonly status: "succeeded" | "failed" | "cancelled";
  readonly errorMessage?: string;
}

// ─── Phase 1 Wave 0: sessions-superset additions ──────────────────────────────
// Canonical turn-by-turn replay shape that mirrors what cc-lens and
// claude-code-viewer expose, but expressed in terms of `@control-plane/core`
// types. Adapters populate these; UI renders them. No adapter-specific fields.

export interface ReplayToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: JsonValue;
}

export interface ReplayToolResult {
  readonly toolUseId: string;
  readonly content: string;
  readonly isError: boolean;
}

export interface ReplayTurn {
  readonly uuid: string;
  readonly parentUuid: string | null;
  readonly type: "user" | "assistant";
  readonly timestamp: string;
  readonly model?: string;
  readonly usage?: TurnUsage;
  readonly text?: string;
  readonly toolCalls?: readonly ReplayToolCall[];
  readonly toolResults?: readonly ReplayToolResult[];
  readonly hasThinking?: boolean;
  readonly thinkingText?: string;
  readonly estimatedCostUsd?: number;
  readonly turnDurationMs?: number;
  readonly responseTimeSec?: number;
}

export interface ReplayCompactionEvent {
  readonly uuid: string;
  readonly timestamp: string;
  readonly trigger: CompactionTrigger;
  readonly preTokens: number;
  readonly summary?: string;
  readonly turnIndex: number;
}

export interface ReplaySummaryEvent {
  readonly uuid: string;
  readonly summary: string;
  readonly leafUuid: string;
}

/**
 * Canonical replay bundle: the turns, compaction boundaries, and summary
 * events of a single session, plus the aggregate cost. Everything is
 * expressed in canonical types; vendor-specific fields live on
 * `metadata` on the originating adapter entities, not here.
 */
export interface ReplayData {
  readonly sessionId: string;
  readonly slug?: string;
  readonly version?: string;
  readonly gitBranch?: string;
  readonly turns: readonly ReplayTurn[];
  readonly compactions: readonly ReplayCompactionEvent[];
  readonly summaries: readonly ReplaySummaryEvent[];
  readonly totalCostUsd: number;
}

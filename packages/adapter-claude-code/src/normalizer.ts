import type {
  JsonObject,
  JsonValue,
  SessionActor,
  SessionContent,
  SessionDescriptor,
  SessionIngestBatch,
  SessionState,
  SessionTurn,
  ToolCall,
  ToolResult,
} from "@control-plane/core";
import {
  AGENT_RUNTIMES,
  SESSION_ACTOR_ROLES,
  SESSION_STATES,
  TOOL_CALL_STATUSES,
} from "@control-plane/core";
import type {
  ClaudeAssistantEntry,
  ClaudeContentBlock,
  ClaudeRawValue,
  ClaudeSystemEntry,
  ClaudeTranscriptEntry,
  ClaudeUserEntry,
} from "./types.js";

type ClaudeTextBlock = Extract<ClaudeContentBlock, { readonly type: "text" }>;
type ClaudeThinkingBlock = Extract<ClaudeContentBlock, { readonly type: "thinking" }>;
type ClaudeToolUseBlock = Extract<ClaudeContentBlock, { readonly type: "tool_use" }>;
type ClaudeToolResultBlock = Extract<ClaudeContentBlock, { readonly type: "tool_result" }>;

/**
 * Options that let a caller adjust normalization without changing the raw
 * transcript. Reserved for future use; kept stable so consumers can opt in.
 */
export interface NormalizeOptions {
  readonly agentId?: string;
  readonly title?: string;
}

export interface NormalizedTranscript {
  readonly session: SessionDescriptor;
  readonly turns: readonly SessionTurn[];
  readonly toolCalls: readonly ToolCall[];
  readonly toolResults: readonly ToolResult[];
  readonly skipped: number;
  readonly batch: SessionIngestBatch;
}

const CLAUDE_CODE_SOURCE = "claude-code";
const DEFAULT_AGENT_ID = CLAUDE_CODE_SOURCE;

interface AccumulatedEntries {
  readonly turns: SessionTurn[];
  readonly toolCalls: ToolCall[];
  readonly toolResults: ToolResult[];
  readonly skipped: number;
}

function accumulateNormalizedEntries(
  entries: readonly ClaudeTranscriptEntry[],
  sessionId: string
): AccumulatedEntries {
  const turns: SessionTurn[] = [];
  const toolCalls: ToolCall[] = [];
  const toolResults: ToolResult[] = [];
  let sequence = 0;
  let skipped = 0;
  const nextSequence = (): number => ++sequence;

  for (const entry of entries) {
    const normalizedTurns = normalizeEntry(entry, sessionId, nextSequence);
    if (normalizedTurns === null) {
      skipped += 1;
      continue;
    }
    for (const item of normalizedTurns) {
      turns.push(item.turn);
      if (item.toolCall) toolCalls.push(item.toolCall);
      if (item.toolResult) toolResults.push(item.toolResult);
    }
  }
  return { turns, toolCalls, toolResults, skipped };
}

export function normalizeTranscript(
  entries: readonly ClaudeTranscriptEntry[],
  options: NormalizeOptions = {}
): NormalizedTranscript {
  if (entries.length === 0) {
    throw new Error("Cannot normalize an empty transcript.");
  }

  const sessionId = firstDefined(entries, (entry) => entry.sessionId);
  if (!sessionId) {
    throw new Error("Transcript is missing a sessionId on every entry.");
  }

  const createdAt = firstDefined(entries, (entry) => entry.timestamp) ?? new Date(0).toISOString();
  const updatedAt = lastDefined(entries, (entry) => entry.timestamp) ?? createdAt;

  const { turns, toolCalls, toolResults, skipped } = accumulateNormalizedEntries(
    entries,
    sessionId
  );

  const derivedTitle = deriveSessionTitle(entries);
  const title = options.title ?? derivedTitle;

  const session: SessionDescriptor = {
    id: sessionId,
    agentId: options.agentId ?? DEFAULT_AGENT_ID,
    runtime: AGENT_RUNTIMES.Claude,
    state: deriveSessionState(entries),
    createdAt,
    updatedAt,
    ...(title !== undefined ? { title } : {}),
    metadata: collectSessionMetadata(entries),
  };

  return {
    session,
    turns,
    toolCalls,
    toolResults,
    skipped,
    batch: { session, turns },
  };
}

interface NormalizedTurnGroup {
  readonly turn: SessionTurn;
  readonly toolCall?: ToolCall;
  readonly toolResult?: ToolResult;
}

function normalizeEntry(
  entry: ClaudeTranscriptEntry,
  sessionId: string,
  nextSequence: () => number
): readonly NormalizedTurnGroup[] | null {
  switch (entry.type) {
    case "user":
      return normalizeUserEntry(entry as ClaudeUserEntry, sessionId, nextSequence);
    case "assistant":
      return normalizeAssistantEntry(entry as ClaudeAssistantEntry, sessionId, nextSequence);
    case "system":
      return normalizeSystemEntry(entry as ClaudeSystemEntry, sessionId, nextSequence);
    default:
      return null;
  }
}

function normalizeUserEntry(
  entry: ClaudeUserEntry,
  sessionId: string,
  nextSequence: () => number
): readonly NormalizedTurnGroup[] {
  const actor: SessionActor = { role: SESSION_ACTOR_ROLES.User };
  const createdAt = entry.timestamp ?? new Date().toISOString();

  if (typeof entry.message.content === "string") {
    return [
      {
        turn: buildTurn({
          id: turnId(entry, "user"),
          sessionId,
          sequence: nextSequence(),
          actor,
          content: { kind: "text", text: entry.message.content },
          createdAt,
          entry,
        }),
      },
    ];
  }

  const groups: NormalizedTurnGroup[] = [];
  for (const block of entry.message.content ?? []) {
    const normalized = normalizeBlockAsUser(
      block,
      entry,
      sessionId,
      nextSequence,
      actor,
      createdAt
    );
    if (normalized) {
      groups.push(normalized);
    }
  }
  return groups;
}

function normalizeBlockAsUser(
  block: ClaudeContentBlock,
  entry: ClaudeUserEntry,
  sessionId: string,
  nextSequence: () => number,
  actor: SessionActor,
  createdAt: string
): NormalizedTurnGroup | null {
  if (isClaudeTextBlock(block)) {
    return {
      turn: buildTurn({
        id: turnId(entry, "user-text"),
        sessionId,
        sequence: nextSequence(),
        actor,
        content: { kind: "text", text: block.text },
        createdAt,
        entry,
      }),
    };
  }

  if (isClaudeToolResultBlock(block)) {
    const status = block.is_error ? TOOL_CALL_STATUSES.Failed : TOOL_CALL_STATUSES.Succeeded;
    const resultContent = toJsonValue(block.content ?? null);
    const toolResult: ToolResult = {
      callId: block.tool_use_id,
      status,
      output: resultContent,
      completedAt: createdAt,
      metadata: {
        source: CLAUDE_CODE_SOURCE,
        ...(entry.uuid ? { entryUuid: entry.uuid } : {}),
      },
    };

    return {
      turn: buildTurn({
        id: turnId(entry, `tool-result-${block.tool_use_id}`),
        sessionId,
        sequence: nextSequence(),
        actor: { role: SESSION_ACTOR_ROLES.Tool },
        content: { kind: "tool_result", result: toolResult },
        createdAt,
        entry,
      }),
      toolResult,
    };
  }

  return null;
}

function normalizeAssistantEntry(
  entry: ClaudeAssistantEntry,
  sessionId: string,
  nextSequence: () => number
): readonly NormalizedTurnGroup[] {
  const actor: SessionActor = { role: SESSION_ACTOR_ROLES.Agent };
  const createdAt = entry.timestamp ?? new Date().toISOString();

  if (typeof entry.message.content === "string") {
    return [
      {
        turn: buildTurn({
          id: turnId(entry, "assistant"),
          sessionId,
          sequence: nextSequence(),
          actor,
          content: { kind: "text", text: entry.message.content },
          createdAt,
          entry,
        }),
      },
    ];
  }

  const groups: NormalizedTurnGroup[] = [];
  for (const block of entry.message.content ?? []) {
    const normalized = normalizeBlockAsAssistant(
      block,
      entry,
      sessionId,
      nextSequence,
      actor,
      createdAt
    );
    if (normalized) {
      groups.push(normalized);
    }
  }
  return groups;
}

function normalizeBlockAsAssistant(
  block: ClaudeContentBlock,
  entry: ClaudeAssistantEntry,
  sessionId: string,
  nextSequence: () => number,
  actor: SessionActor,
  createdAt: string
): NormalizedTurnGroup | null {
  if (isClaudeTextBlock(block)) {
    return {
      turn: buildTurn({
        id: turnId(entry, "assistant-text"),
        sessionId,
        sequence: nextSequence(),
        actor,
        content: { kind: "text", text: block.text },
        createdAt,
        entry,
      }),
    };
  }

  if (isClaudeThinkingBlock(block)) {
    return {
      turn: buildTurn({
        id: turnId(entry, "assistant-thinking"),
        sessionId,
        sequence: nextSequence(),
        actor,
        content: { kind: "text", text: block.thinking },
        createdAt,
        entry,
        extraMetadata: { thinking: true },
      }),
    };
  }

  if (isClaudeToolUseBlock(block)) {
    const toolCall: ToolCall = {
      id: block.id,
      sessionId,
      toolName: block.name,
      status: TOOL_CALL_STATUSES.Running,
      input: toJsonValue(block.input ?? null),
      requestedAt: createdAt,
      startedAt: createdAt,
      metadata: {
        source: CLAUDE_CODE_SOURCE,
        ...(entry.uuid ? { entryUuid: entry.uuid } : {}),
      },
    };

    return {
      turn: buildTurn({
        id: turnId(entry, `tool-use-${block.id}`),
        sessionId,
        sequence: nextSequence(),
        actor,
        content: { kind: "tool_call", call: toolCall },
        createdAt,
        entry,
      }),
      toolCall,
    };
  }

  return null;
}

function normalizeSystemEntry(
  entry: ClaudeSystemEntry,
  sessionId: string,
  nextSequence: () => number
): readonly NormalizedTurnGroup[] {
  const actor: SessionActor = { role: SESSION_ACTOR_ROLES.System };
  const createdAt = entry.timestamp ?? new Date().toISOString();

  const text = typeof entry.message?.content === "string" ? entry.message.content : entry.content;

  if (!text) {
    return [];
  }

  return [
    {
      turn: buildTurn({
        id: turnId(entry, "system"),
        sessionId,
        sequence: nextSequence(),
        actor,
        content: { kind: "text", text },
        createdAt,
        entry,
      }),
    },
  ];
}

interface BuildTurnInput {
  readonly id: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly actor: SessionActor;
  readonly content: SessionContent;
  readonly createdAt: string;
  readonly entry: ClaudeTranscriptEntry;
  readonly extraMetadata?: JsonObject;
}

function buildTurn(input: BuildTurnInput): SessionTurn {
  const metadata: JsonObject = {
    source: CLAUDE_CODE_SOURCE,
    ...(input.entry.uuid ? { entryUuid: input.entry.uuid } : {}),
    ...(input.entry.parentUuid ? { parentUuid: input.entry.parentUuid } : {}),
    ...(input.entry.cwd ? { cwd: input.entry.cwd } : {}),
    ...(input.entry.version ? { claudeVersion: input.entry.version } : {}),
    ...(input.extraMetadata ?? {}),
  };

  const correlationId = input.entry.uuid ?? input.entry.parentUuid;

  return {
    id: input.id,
    sessionId: input.sessionId,
    sequence: input.sequence,
    actor: input.actor,
    content: input.content,
    createdAt: input.createdAt,
    ...(correlationId ? { correlationId } : {}),
    metadata,
  };
}

function collectSessionMetadata(entries: readonly ClaudeTranscriptEntry[]): JsonObject {
  const first = entries[0];
  const metadata: Record<string, JsonValue> = { source: CLAUDE_CODE_SOURCE };

  if (first?.cwd) metadata.cwd = first.cwd;
  if (first?.version) metadata.claudeVersion = first.version;
  if (first?.gitBranch) metadata.gitBranch = first.gitBranch;

  const model = firstDefined(entries, (entry) =>
    entry.type === "assistant" ? (entry as ClaudeAssistantEntry).message.model : undefined
  );
  if (model) {
    metadata.model = model;
  }

  return metadata;
}

function deriveSessionTitle(entries: readonly ClaudeTranscriptEntry[]): string | undefined {
  const fromSummary = titleFromSummaryEntries(entries);
  if (fromSummary !== undefined) return fromSummary;
  return titleFromUserEntries(entries);
}

function titleFromSummaryEntries(entries: readonly ClaudeTranscriptEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "summary") continue;
    const summary = (entry as { readonly summary?: string }).summary;
    if (typeof summary === "string" && summary.trim().length > 0) {
      return truncateTitle(summary);
    }
  }
  return undefined;
}

function titleFromUserEntries(entries: readonly ClaudeTranscriptEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "user") continue;
    const candidates = collectUserTextCandidates((entry as ClaudeUserEntry).message?.content);
    for (const raw of candidates) {
      const cleaned = sanitizeTitleCandidate(raw);
      if (cleaned) return truncateTitle(cleaned);
    }
  }
  return undefined;
}

function collectUserTextCandidates(
  content: string | readonly ClaudeContentBlock[] | undefined
): readonly string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  // Re-assert readonly element type: `Array.isArray` narrows to `any[]` and
  // collapses the `readonly ClaudeContentBlock[]` shape, defeating the guard.
  const blocks: readonly ClaudeContentBlock[] = content;
  const candidates: string[] = [];
  for (const block of blocks) {
    if (isClaudeTextBlock(block)) candidates.push(block.text);
  }
  return candidates;
}

// Claude Code injects wrappers like <local-command-caveat>, <command-name>,
// <command-message>, <command-args>, and <system-reminder> into user turns
// whenever the user runs a slash command or the client ships boilerplate.
// These aren't human-authored titles, so we drop the entire block (tag AND
// inner content) and fall back to the next candidate.
const NOISE_TAG_NAME = "(?:local-command-[a-z-]+|command-[a-z-]+|system-reminder|ide-[a-z-]+)";
const NOISE_TAG_BLOCK = new RegExp(`<(${NOISE_TAG_NAME})\\b[^>]*>[\\s\\S]*?</\\1>`, "gi");
const NOISE_SELF_CLOSING = new RegExp(`<${NOISE_TAG_NAME}\\b[^/>]*/>`, "gi");
const STRAY_TAG = /<\/?[a-z][^>]*>/gi;

function sanitizeTitleCandidate(text: string): string | null {
  let stripped = text.replace(NOISE_TAG_BLOCK, " ");
  stripped = stripped.replace(NOISE_SELF_CLOSING, " ");
  stripped = stripped.replace(STRAY_TAG, " ");
  // Prefer the first non-empty line; only collapse whitespace within it.
  const firstLine = stripped
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .find((line) => line.length > 0);
  if (!firstLine || firstLine.length < 2) return null;
  if (/^(ping|hi|hey|hello|test|ok)$/i.test(firstLine)) return null;
  return firstLine;
}

function truncateTitle(text: string, maxLength = 160): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? text.trim();
  if (firstLine.length <= maxLength) return firstLine;
  return `${firstLine.slice(0, maxLength - 1).trimEnd()}…`;
}

function deriveSessionState(entries: readonly ClaudeTranscriptEntry[]): SessionState {
  const last = entries[entries.length - 1];
  if (!last) {
    return SESSION_STATES.Completed;
  }
  if (last.type === "summary") {
    return SESSION_STATES.Completed;
  }
  return SESSION_STATES.Completed;
}

function turnId(entry: ClaudeTranscriptEntry, suffix: string): string {
  const base = entry.uuid ?? `${entry.type}-${entry.timestamp ?? "unknown"}`;
  return `${base}:${suffix}`;
}

function firstDefined<T, R>(
  items: readonly T[],
  selector: (item: T) => R | undefined | null
): R | undefined {
  for (const item of items) {
    const value = selector(item);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function lastDefined<T, R>(
  items: readonly T[],
  selector: (item: T) => R | undefined | null
): R | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item === undefined) continue;
    const value = selector(item);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function toJsonValue(raw: ClaudeRawValue): JsonValue {
  if (
    raw === null ||
    typeof raw === "string" ||
    typeof raw === "number" ||
    typeof raw === "boolean"
  ) {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => toJsonValue(item));
  }
  const entries: [string, JsonValue][] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    entries.push([key, toJsonValue(value)]);
  }
  return Object.fromEntries(entries);
}

function isClaudeTextBlock(block: ClaudeContentBlock): block is ClaudeTextBlock {
  return block.type === "text" && typeof block.text === "string";
}

function isClaudeThinkingBlock(block: ClaudeContentBlock): block is ClaudeThinkingBlock {
  return block.type === "thinking" && typeof block.thinking === "string";
}

function isClaudeToolUseBlock(block: ClaudeContentBlock): block is ClaudeToolUseBlock {
  return (
    block.type === "tool_use" &&
    typeof block.id === "string" &&
    typeof block.name === "string" &&
    "input" in block
  );
}

function isClaudeToolResultBlock(block: ClaudeContentBlock): block is ClaudeToolResultBlock {
  return block.type === "tool_result" && typeof block.tool_use_id === "string";
}

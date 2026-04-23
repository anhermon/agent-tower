import {
  type CacheEfficiency,
  cacheEfficiency,
  categorizeTool,
  EMPTY_CACHE_EFFICIENCY,
  estimateCostFromUsage,
  type ModelUsage,
  type SessionCompactionEvent,
  type SessionDerivedFlags,
  type SessionTurnUsage,
  type SessionUsageSummary,
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
      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          classifyBlock(block, toolCounts, flags);
        }
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
      }
    }
  }

  const model = latestModel ?? firstModel;
  const efficiency: CacheEfficiency = model
    ? cacheEfficiency(model, usage)
    : EMPTY_CACHE_EFFICIENCY;

  const durationMs = startTime && endTime ? Math.max(0, isoDelta(startTime, endTime)) : undefined;

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

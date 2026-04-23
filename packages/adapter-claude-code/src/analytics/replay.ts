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
import type {
  ClaudeAssistantEntry,
  ClaudeContentBlock,
  ClaudeRawValue,
  ClaudeSystemEntry,
  ClaudeTranscriptEntry,
  ClaudeUserEntry,
} from "../types.js";
import { normalizeTurnUsage } from "./session-summary.js";

export interface ReplayFoldOptions {
  readonly sessionId?: string;
  readonly toolResultPreviewLimit?: number;
}

export function foldReplay(
  entries: readonly ClaudeTranscriptEntry[],
  options: ReplayFoldOptions = {}
): ReplayData {
  const limit = Math.max(0, options.toolResultPreviewLimit ?? 2000);

  const turns: ReplayTurn[] = [];
  const compactions: ReplayCompactionEvent[] = [];
  const summaries: ReplaySummaryEvent[] = [];

  let slug: string | undefined;
  let version: string | undefined;
  let gitBranch: string | undefined;
  let sessionId = options.sessionId;
  let totalCostUsd = 0;

  // Map of turn_duration events keyed by parentUuid.
  const turnDurations = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type === "system") {
      const sys = entry as ClaudeSystemEntry;
      const subtype = (sys as unknown as { subtype?: string }).subtype;
      if (subtype === "turn_duration") {
        const parent = sys.parentUuid ?? undefined;
        const duration = (sys as unknown as { durationMs?: number }).durationMs;
        if (parent && typeof duration === "number") turnDurations.set(parent, duration);
      }
    }
    if (!sessionId && entry.sessionId) sessionId = entry.sessionId;
    if (!slug && (entry as unknown as { slug?: string }).slug) {
      slug = (entry as unknown as { slug?: string }).slug;
    }
    if (!version && entry.version) version = entry.version;
    if (!gitBranch && entry.gitBranch && entry.gitBranch !== "HEAD") {
      gitBranch = entry.gitBranch;
    }
  }

  let turnIndex = 0;
  let lastAssistantTs: number | undefined;

  for (const entry of entries) {
    // ─── Summary event
    if (entry.type === "summary") {
      const s = entry as { uuid?: string; summary?: string; leafUuid?: string };
      summaries.push({
        uuid: s.uuid ?? "",
        summary: s.summary ?? "",
        leafUuid: s.leafUuid ?? "",
      });
      continue;
    }

    // ─── Compaction boundary
    if (entry.type === "system") {
      const sys = entry as ClaudeSystemEntry;
      const subtype = (sys as unknown as { subtype?: string }).subtype;
      if (subtype === "compact_boundary") {
        const meta =
          (
            sys as unknown as {
              compactMetadata?: { trigger?: string; preTokens?: number };
            }
          ).compactMetadata ?? {};
        const trigger =
          meta.trigger === "auto" ? "auto" : meta.trigger === "manual" ? "manual" : "unknown";
        const directSummary =
          typeof (sys as unknown as { content?: unknown }).content === "string"
            ? ((sys as unknown as { content: string }).content as string)
            : undefined;
        const fallbackSummary =
          summaries.length > 0 ? summaries[summaries.length - 1]?.summary : undefined;
        const resolvedSummary = directSummary ?? fallbackSummary;
        compactions.push({
          uuid: sys.uuid ?? "",
          timestamp: sys.timestamp ?? "",
          trigger,
          preTokens: meta.preTokens ?? 0,
          turnIndex,
          ...(resolvedSummary !== undefined ? { summary: resolvedSummary } : {}),
        });
      }
      continue;
    }

    // ─── User turn
    if (entry.type === "user") {
      const user = entry as ClaudeUserEntry;
      const msg = user.message;
      let text = "";
      const toolResults: ReplayToolResult[] = [];

      if (typeof msg?.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg?.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && typeof block.text === "string") {
            text += block.text as string;
          }
          if (block.type === "tool_result") {
            const raw = (block as { content?: ClaudeRawValue }).content;
            const preview = toolResultPreview(raw, limit);
            const isError = (block as { is_error?: boolean }).is_error === true;
            const toolUseId = (block as { tool_use_id?: string }).tool_use_id ?? "";
            toolResults.push({ toolUseId, content: preview, isError });
          }
        }
      }

      turns.push({
        uuid: user.uuid ?? "",
        parentUuid: user.parentUuid ?? null,
        type: "user",
        timestamp: user.timestamp ?? "",
        text: text.trim(),
        ...(toolResults.length > 0 ? { toolResults } : {}),
      });
      turnIndex += 1;
      continue;
    }

    // ─── Assistant turn
    if (entry.type === "assistant") {
      const assistant = entry as ClaudeAssistantEntry;
      const msg = assistant.message;
      const usage: TurnUsage | undefined = normalizeTurnUsage(msg?.usage);
      const model = msg?.model;
      const content = msg?.content ?? [];

      let text = "";
      let hasThinking = false;
      let thinkingText = "";
      const toolCalls: ReplayToolCall[] = [];

      if (Array.isArray(content)) {
        for (const block of content as readonly ClaudeContentBlock[]) {
          if (block.type === "text" && typeof block.text === "string") {
            text += block.text as string;
          }
          if (block.type === "thinking") {
            hasThinking = true;
            const tx = (block as { thinking?: string }).thinking;
            if (typeof tx === "string") thinkingText += tx;
          }
          if (block.type === "tool_use") {
            const id = (block as { id?: string }).id ?? "";
            const name = (block as { name?: string }).name ?? "";
            const rawInput = (block as { input?: ClaudeRawValue }).input ?? null;
            toolCalls.push({ id, name, input: rawInput as unknown as never });
          }
        }
      }

      const estimated = model && usage ? estimateCostFromUsage(model, usage) : 0;
      totalCostUsd += estimated;
      const durationMs = assistant.uuid ? turnDurations.get(assistant.uuid) : undefined;

      const ts = assistant.timestamp ? Date.parse(assistant.timestamp) : NaN;
      let responseTimeSec: number | undefined;
      if (Number.isFinite(ts) && lastAssistantTs !== undefined) {
        responseTimeSec = Math.max(0, (ts - lastAssistantTs) / 1000);
      }
      if (Number.isFinite(ts)) lastAssistantTs = ts;

      turns.push({
        uuid: assistant.uuid ?? "",
        parentUuid: assistant.parentUuid ?? null,
        type: "assistant",
        timestamp: assistant.timestamp ?? "",
        ...(model ? { model } : {}),
        ...(usage ? { usage } : {}),
        text: text.trim(),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        hasThinking,
        ...(thinkingText.trim() ? { thinkingText: thinkingText.trim() } : {}),
        estimatedCostUsd: estimated,
        ...(typeof durationMs === "number" ? { turnDurationMs: durationMs } : {}),
        ...(typeof responseTimeSec === "number" ? { responseTimeSec } : {}),
      });
      turnIndex += 1;
    }
  }

  return {
    sessionId: sessionId ?? "unknown",
    ...(slug ? { slug } : {}),
    ...(version ? { version } : {}),
    ...(gitBranch ? { gitBranch } : {}),
    turns,
    compactions,
    summaries,
    totalCostUsd,
  };
}

function toolResultPreview(raw: ClaudeRawValue | undefined, limit: number): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") return raw.slice(0, limit);
  if (Array.isArray(raw)) {
    const joined = raw
      .map((v) =>
        typeof v === "object" && v !== null && "text" in v
          ? String((v as { text?: unknown }).text ?? "")
          : String(v)
      )
      .join("");
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
  return String(raw).slice(0, limit);
}

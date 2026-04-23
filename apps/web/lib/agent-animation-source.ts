import type {
  ClaudeAssistantEntry,
  ClaudeContentBlock,
  ClaudeSystemEntry,
  ClaudeTranscriptEntry,
  ClaudeUserEntry,
} from "@control-plane/adapter-claude-code";
import {
  AGENT_ANIMATION_BASE_STATES,
  AGENT_ANIMATION_OVERLAYS,
  AGENT_FATIGUE_LEVELS,
  type AgentAnimationBaseState,
  type AgentAnimationOverlay,
  type AgentAnimationSnapshot,
  type AgentFatigueLevel,
} from "@control-plane/core";

export const AGENT_ANIMATION_PERMISSION_TIMEOUT_MS = 7_000;
export const AGENT_ANIMATION_STARTUP_PRUNE_MS = 10 * 60 * 1_000;
export const AGENT_ANIMATION_SUBAGENT_IDLE_MS = 5_000;
export const AGENT_ANIMATION_HOT_SESSION_MS = 10 * 60 * 1_000;

const HIGH_CONTEXT_TOKENS = 120_000;
const EXHAUSTED_CONTEXT_TOKENS = 150_000;
const SLIGHTLY_TIRED_ACTIVE_MS = 45 * 60 * 1_000;
const TIRED_ACTIVE_MS = 2 * 60 * 60 * 1_000;
const EXHAUSTED_ACTIVE_MS = 4 * 60 * 60 * 1_000;

const PERMISSION_EXEMPT_TOOLS = new Set(["Task", "Agent", "AskUserQuestion"]);

const OVERLAY_PRIORITY: Record<AgentAnimationOverlay, number> = {
  [AGENT_ANIMATION_OVERLAYS.None]: 0,
  [AGENT_ANIMATION_OVERLAYS.Subagent]: 1,
  [AGENT_ANIMATION_OVERLAYS.SkillLoaded]: 2,
  [AGENT_ANIMATION_OVERLAYS.Success]: 3,
  [AGENT_ANIMATION_OVERLAYS.Permission]: 4,
  [AGENT_ANIMATION_OVERLAYS.Compacting]: 4,
  [AGENT_ANIMATION_OVERLAYS.Failure]: 5,
};

const FATIGUE_WEIGHT: Record<AgentFatigueLevel, number> = {
  [AGENT_FATIGUE_LEVELS.Fresh]: 0,
  [AGENT_FATIGUE_LEVELS.SlightlyTired]: 1,
  [AGENT_FATIGUE_LEVELS.Tired]: 2,
  [AGENT_FATIGUE_LEVELS.Exhausted]: 3,
};

export interface AgentAnimationDeriveInput {
  readonly agentId: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly entries: readonly ClaudeTranscriptEntry[];
  readonly now?: Date;
  readonly fileModifiedAt?: Date;
  readonly startup?: boolean;
  readonly backgroundSubagentCount?: number;
}

export interface AgentAnimationDerivation {
  readonly snapshot: AgentAnimationSnapshot | null;
  readonly nextPermissionCheckAtMs: number | null;
}

interface PendingTool {
  readonly observedAtMs: number;
}

interface Pose {
  readonly baseState: AgentAnimationBaseState;
  readonly overlay: AgentAnimationOverlay;
}

export function deriveAgentAnimationSnapshot(
  input: AgentAnimationDeriveInput
): AgentAnimationDerivation {
  const nowMs = input.now?.getTime() ?? Date.now();
  if (input.startup && input.fileModifiedAt) {
    const ageMs = nowMs - input.fileModifiedAt.getTime();
    if (Number.isFinite(ageMs) && ageMs > AGENT_ANIMATION_STARTUP_PRUNE_MS) {
      return { snapshot: null, nextPermissionCheckAtMs: null };
    }
  }

  const pendingTools = new Map<string, PendingTool>();
  const activeForegroundSubagents = new Set<string>();
  const backgroundSubagentCount = Math.max(0, input.backgroundSubagentCount ?? 0);

  let pose: Pose = {
    baseState: AGENT_ANIMATION_BASE_STATES.Sleeping,
    overlay: AGENT_ANIMATION_OVERLAYS.None,
  };
  let firstActivityAtMs: number | null = null;
  let lastEventAtMs: number | null = input.fileModifiedAt?.getTime() ?? null;
  let stopped = false;
  let sawRelevantRecord = false;
  let maxContextTokens = 0;
  let compactionPreTokens = 0;

  for (const entry of input.entries) {
    const eventAtMs = entryTimeMs(entry, lastEventAtMs ?? nowMs);
    lastEventAtMs = eventAtMs;

    if (entry.type === "assistant") {
      const assistant = entry as ClaudeAssistantEntry;
      const content = arrayContent(assistant.message?.content);
      if (!content) continue;

      const toolUses = content.filter(isToolUseBlock);
      const hasText = content.some(
        (block) => block.type === "text" && typeof block.text === "string" && block.text.trim()
      );
      const hasActivity = hasText || toolUses.length > 0;

      maxContextTokens = Math.max(maxContextTokens, usageContextTokens(assistant));

      if (hasActivity) {
        sawRelevantRecord = true;
        stopped = false;
        firstActivityAtMs ??= eventAtMs;
        pose = {
          baseState: AGENT_ANIMATION_BASE_STATES.Working,
          overlay: AGENT_ANIMATION_OVERLAYS.None,
        };
      }

      for (const tool of toolUses) {
        if (!PERMISSION_EXEMPT_TOOLS.has(tool.name)) {
          pendingTools.set(tool.id, { observedAtMs: eventAtMs });
        }
      }
      continue;
    }

    if (entry.type === "user") {
      const user = entry as ClaudeUserEntry;
      const content = arrayContent(user.message?.content);
      if (!content) continue;

      let hadFailure = false;
      for (const block of content) {
        if (block.type !== "tool_result") continue;
        if (typeof block.tool_use_id === "string") {
          pendingTools.delete(block.tool_use_id);
        }
        if (block.is_error === true) {
          hadFailure = true;
        }
      }

      if (hadFailure) {
        sawRelevantRecord = true;
        stopped = false;
        firstActivityAtMs ??= eventAtMs;
        pose = {
          baseState: AGENT_ANIMATION_BASE_STATES.Failed,
          overlay: AGENT_ANIMATION_OVERLAYS.Failure,
        };
      }
      continue;
    }

    if (entry.type === "system") {
      const system = entry as ClaudeSystemEntry & {
        readonly subtype?: string;
        readonly compactMetadata?: { readonly preTokens?: number };
      };
      const subtype = typeof system.subtype === "string" ? system.subtype : "";

      if (subtype === "turn_duration") {
        pendingTools.clear();
        activeForegroundSubagents.clear();
        sawRelevantRecord = true;
        stopped = true;
        pose = {
          baseState: AGENT_ANIMATION_BASE_STATES.Done,
          overlay: AGENT_ANIMATION_OVERLAYS.Success,
        };
        continue;
      }

      if (isCompactionSubtype(subtype)) {
        const preTokens = system.compactMetadata?.preTokens;
        if (typeof preTokens === "number" && Number.isFinite(preTokens)) {
          compactionPreTokens = Math.max(compactionPreTokens, preTokens);
        }
        sawRelevantRecord = true;
        stopped = false;
        firstActivityAtMs ??= eventAtMs;
        pose = {
          baseState: AGENT_ANIMATION_BASE_STATES.Attention,
          overlay: AGENT_ANIMATION_OVERLAYS.Compacting,
        };
      }
      continue;
    }

    if (entry.type === "progress") {
      const progress = progressRecord(entry);
      if (progress?.kind === "agent_progress") {
        const parentToolId = progress.parentToolUseID ?? progress.toolUseID;
        if (parentToolId) {
          activeForegroundSubagents.add(parentToolId);
          sawRelevantRecord = true;
          stopped = false;
          firstActivityAtMs ??= eventAtMs;
          pose = {
            baseState: AGENT_ANIMATION_BASE_STATES.Working,
            overlay: AGENT_ANIMATION_OVERLAYS.Subagent,
          };
        }
      } else if (progress?.kind === "skill_loaded") {
        sawRelevantRecord = true;
        stopped = false;
        firstActivityAtMs ??= eventAtMs;
        pose = {
          baseState: AGENT_ANIMATION_BASE_STATES.Working,
          overlay: AGENT_ANIMATION_OVERLAYS.SkillLoaded,
        };
      }
    }
  }

  let nextPermissionCheckAtMs: number | null = null;
  for (const pending of pendingTools.values()) {
    const dueAtMs = pending.observedAtMs + AGENT_ANIMATION_PERMISSION_TIMEOUT_MS;
    if (nowMs >= dueAtMs) {
      sawRelevantRecord = true;
      stopped = false;
      lastEventAtMs = Math.max(lastEventAtMs ?? dueAtMs, dueAtMs);
      pose = {
        baseState: AGENT_ANIMATION_BASE_STATES.Attention,
        overlay: AGENT_ANIMATION_OVERLAYS.Permission,
      };
    } else {
      nextPermissionCheckAtMs =
        nextPermissionCheckAtMs === null ? dueAtMs : Math.min(nextPermissionCheckAtMs, dueAtMs);
    }
  }

  const subagentCount = activeForegroundSubagents.size + backgroundSubagentCount;
  if (
    subagentCount > 0 &&
    OVERLAY_PRIORITY[pose.overlay] <= OVERLAY_PRIORITY[AGENT_ANIMATION_OVERLAYS.Subagent]
  ) {
    sawRelevantRecord = true;
    stopped = false;
    pose = {
      baseState: AGENT_ANIMATION_BASE_STATES.Working,
      overlay: AGENT_ANIMATION_OVERLAYS.Subagent,
    };
  }

  if (!sawRelevantRecord && input.entries.length === 0) {
    return { snapshot: null, nextPermissionCheckAtMs };
  }

  const activeAgeMs =
    firstActivityAtMs === null ? 0 : Math.max(0, nowMs - Math.min(firstActivityAtMs, nowMs));
  const fatigueLevel = deriveFatigueLevel(maxContextTokens, compactionPreTokens, activeAgeMs);
  const isActive =
    !stopped &&
    (pendingTools.size > 0 ||
      subagentCount > 0 ||
      pose.baseState === AGENT_ANIMATION_BASE_STATES.Working ||
      pose.baseState === AGENT_ANIMATION_BASE_STATES.Attention ||
      pose.baseState === AGENT_ANIMATION_BASE_STATES.Failed);

  const snapshot: AgentAnimationSnapshot = {
    agentId: input.agentId,
    projectId: input.projectId,
    baseState: pose.baseState,
    overlay: pose.overlay,
    fatigueLevel,
    activeSessionIds: isActive ? [input.sessionId] : [],
    subagentCount,
    lastEventAt: new Date(lastEventAtMs ?? nowMs).toISOString(),
  };

  return { snapshot, nextPermissionCheckAtMs };
}

export function mergeAgentAnimationSnapshots(
  snapshots: readonly AgentAnimationSnapshot[]
): AgentAnimationSnapshot | null {
  if (snapshots.length === 0) return null;

  let latest = snapshots[0]!;
  for (const snapshot of snapshots.slice(1)) {
    if (snapshot.lastEventAt > latest.lastEventAt) {
      latest = snapshot;
    }
  }

  const activeSessionIds = new Set<string>();
  let subagentCount = 0;
  let fatigueLevel: AgentFatigueLevel = AGENT_FATIGUE_LEVELS.Fresh;

  for (const snapshot of snapshots) {
    for (const sessionId of snapshot.activeSessionIds) activeSessionIds.add(sessionId);
    subagentCount += snapshot.subagentCount;
    if (FATIGUE_WEIGHT[snapshot.fatigueLevel] > FATIGUE_WEIGHT[fatigueLevel]) {
      fatigueLevel = snapshot.fatigueLevel;
    }
  }

  const overlay =
    subagentCount > 0 && latest.overlay === AGENT_ANIMATION_OVERLAYS.None
      ? AGENT_ANIMATION_OVERLAYS.Subagent
      : latest.overlay;
  const baseState =
    subagentCount > 0 && latest.baseState === AGENT_ANIMATION_BASE_STATES.Sleeping
      ? AGENT_ANIMATION_BASE_STATES.Working
      : latest.baseState;

  return {
    ...latest,
    baseState,
    overlay,
    fatigueLevel,
    activeSessionIds: [...activeSessionIds].sort(),
    subagentCount,
  };
}

function arrayContent(content: ClaudeAssistantEntry["message"]["content"] | undefined) {
  return Array.isArray(content) ? content : null;
}

function isToolUseBlock(
  block: ClaudeContentBlock
): block is Extract<ClaudeContentBlock, { readonly type: "tool_use" }> {
  return (
    block.type === "tool_use" &&
    typeof block.id === "string" &&
    typeof block.name === "string" &&
    block.id.length > 0
  );
}

function entryTimeMs(entry: ClaudeTranscriptEntry, fallbackMs: number): number {
  if (typeof entry.timestamp === "string") {
    const parsed = new Date(entry.timestamp).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackMs;
}

function usageContextTokens(entry: ClaudeAssistantEntry): number {
  const usage = entry.message?.usage;
  if (!usage) return 0;
  return Math.max(
    usage.input_tokens ?? 0,
    (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  );
}

function isCompactionSubtype(subtype: string): boolean {
  const normalized = subtype.toLowerCase();
  return (
    normalized === "compact_boundary" ||
    normalized === "precompact" ||
    normalized === "pre_compact" ||
    normalized.includes("compact")
  );
}

function progressRecord(entry: ClaudeTranscriptEntry): {
  readonly kind: "agent_progress" | "skill_loaded";
  readonly parentToolUseID?: string;
  readonly toolUseID?: string;
} | null {
  const record = entry as unknown as {
    readonly data?: { readonly type?: unknown };
    readonly parentToolUseID?: unknown;
    readonly toolUseID?: unknown;
  };
  const dataType = typeof record.data?.type === "string" ? record.data.type : "";
  const kind =
    dataType === "agent_progress"
      ? "agent_progress"
      : dataType.toLowerCase().includes("skill") && dataType.toLowerCase().includes("load")
        ? "skill_loaded"
        : null;
  if (!kind) return null;
  const result: {
    kind: "agent_progress" | "skill_loaded";
    parentToolUseID?: string;
    toolUseID?: string;
  } = { kind };
  if (typeof record.parentToolUseID === "string") {
    result.parentToolUseID = record.parentToolUseID;
  }
  if (typeof record.toolUseID === "string") {
    result.toolUseID = record.toolUseID;
  }
  return result;
}

function deriveFatigueLevel(
  maxContextTokens: number,
  compactionPreTokens: number,
  activeAgeMs: number
): AgentFatigueLevel {
  const contextTokens = Math.max(maxContextTokens, compactionPreTokens);
  if (contextTokens >= EXHAUSTED_CONTEXT_TOKENS || activeAgeMs >= EXHAUSTED_ACTIVE_MS) {
    return AGENT_FATIGUE_LEVELS.Exhausted;
  }
  if (contextTokens >= HIGH_CONTEXT_TOKENS || activeAgeMs >= TIRED_ACTIVE_MS) {
    return AGENT_FATIGUE_LEVELS.Tired;
  }
  if (compactionPreTokens > 0 || activeAgeMs >= SLIGHTLY_TIRED_ACTIVE_MS) {
    return AGENT_FATIGUE_LEVELS.SlightlyTired;
  }
  return AGENT_FATIGUE_LEVELS.Fresh;
}

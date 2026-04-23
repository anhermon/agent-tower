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

interface Accumulator {
  pose: Pose;
  firstActivityAtMs: number | null;
  lastEventAtMs: number | null;
  stopped: boolean;
  sawRelevantRecord: boolean;
  maxContextTokens: number;
  compactionPreTokens: number;
  readonly pendingTools: Map<string, PendingTool>;
  readonly activeForegroundSubagents: Set<string>;
}

function createAccumulator(fileModifiedAt: Date | undefined): Accumulator {
  return {
    pose: {
      baseState: AGENT_ANIMATION_BASE_STATES.Sleeping,
      overlay: AGENT_ANIMATION_OVERLAYS.None,
    },
    firstActivityAtMs: null,
    lastEventAtMs: fileModifiedAt?.getTime() ?? null,
    stopped: false,
    sawRelevantRecord: false,
    maxContextTokens: 0,
    compactionPreTokens: 0,
    pendingTools: new Map(),
    activeForegroundSubagents: new Set(),
  };
}

function markActivity(acc: Accumulator, eventAtMs: number, pose: Pose): void {
  acc.sawRelevantRecord = true;
  acc.stopped = false;
  acc.firstActivityAtMs ??= eventAtMs;
  acc.pose = pose;
}

export function deriveAgentAnimationSnapshot(
  input: AgentAnimationDeriveInput
): AgentAnimationDerivation {
  const nowMs = input.now?.getTime() ?? Date.now();
  if (shouldPruneForStartup(input, nowMs)) {
    return { snapshot: null, nextPermissionCheckAtMs: null };
  }

  const backgroundSubagentCount = Math.max(0, input.backgroundSubagentCount ?? 0);
  const acc = createAccumulator(input.fileModifiedAt);

  for (const entry of input.entries) {
    const eventAtMs = entryTimeMs(entry, acc.lastEventAtMs ?? nowMs);
    acc.lastEventAtMs = eventAtMs;
    applyEntry(acc, entry, eventAtMs);
  }

  const nextPermissionCheckAtMs = resolvePendingPermissions(acc, nowMs);

  const subagentCount = acc.activeForegroundSubagents.size + backgroundSubagentCount;
  applySubagentOverlay(acc, subagentCount);

  if (!acc.sawRelevantRecord && input.entries.length === 0) {
    return { snapshot: null, nextPermissionCheckAtMs };
  }

  const snapshot = buildSnapshot(input, acc, nowMs, subagentCount);
  return { snapshot, nextPermissionCheckAtMs };
}

function shouldPruneForStartup(input: AgentAnimationDeriveInput, nowMs: number): boolean {
  if (!input.startup || !input.fileModifiedAt) return false;
  const ageMs = nowMs - input.fileModifiedAt.getTime();
  return Number.isFinite(ageMs) && ageMs > AGENT_ANIMATION_STARTUP_PRUNE_MS;
}

function applyEntry(acc: Accumulator, entry: ClaudeTranscriptEntry, eventAtMs: number): void {
  switch (entry.type) {
    case "assistant":
      applyAssistantEntry(acc, entry as ClaudeAssistantEntry, eventAtMs);
      return;
    case "user":
      applyUserEntry(acc, entry as ClaudeUserEntry, eventAtMs);
      return;
    case "system":
      applySystemEntry(acc, entry as ClaudeSystemEntry, eventAtMs);
      return;
    case "progress":
      applyProgressEntry(acc, entry, eventAtMs);
      return;
    default:
      return;
  }
}

function applyAssistantEntry(
  acc: Accumulator,
  assistant: ClaudeAssistantEntry,
  eventAtMs: number
): void {
  const content = arrayContent(assistant.message?.content);
  if (!content) return;

  const toolUses = content.filter(isToolUseBlock);
  const hasActivity = hasTextActivity(content) || toolUses.length > 0;

  acc.maxContextTokens = Math.max(acc.maxContextTokens, usageContextTokens(assistant));

  if (hasActivity) {
    markActivity(acc, eventAtMs, {
      baseState: AGENT_ANIMATION_BASE_STATES.Working,
      overlay: AGENT_ANIMATION_OVERLAYS.None,
    });
  }

  for (const tool of toolUses) {
    if (!PERMISSION_EXEMPT_TOOLS.has(tool.name)) {
      acc.pendingTools.set(tool.id, { observedAtMs: eventAtMs });
    }
  }
}

function hasTextActivity(content: readonly ClaudeContentBlock[]): boolean {
  return content.some(
    (block) => block.type === "text" && typeof block.text === "string" && block.text.trim() !== ""
  );
}

function applyUserEntry(acc: Accumulator, user: ClaudeUserEntry, eventAtMs: number): void {
  const content = arrayContent(user.message?.content);
  if (!content) return;

  let hadFailure = false;
  for (const block of content) {
    if (block.type !== "tool_result") continue;
    if (typeof block.tool_use_id === "string") {
      acc.pendingTools.delete(block.tool_use_id);
    }
    if (block.is_error === true) {
      hadFailure = true;
    }
  }

  if (hadFailure) {
    markActivity(acc, eventAtMs, {
      baseState: AGENT_ANIMATION_BASE_STATES.Failed,
      overlay: AGENT_ANIMATION_OVERLAYS.Failure,
    });
  }
}

type SystemEntryWithSubtype = ClaudeSystemEntry & {
  readonly subtype?: string;
  readonly compactMetadata?: { readonly preTokens?: number };
};

function applySystemEntry(acc: Accumulator, rawSystem: ClaudeSystemEntry, eventAtMs: number): void {
  const system = rawSystem as SystemEntryWithSubtype;
  const subtype = typeof system.subtype === "string" ? system.subtype : "";

  if (subtype === "turn_duration") {
    acc.pendingTools.clear();
    acc.activeForegroundSubagents.clear();
    acc.sawRelevantRecord = true;
    acc.stopped = true;
    acc.pose = {
      baseState: AGENT_ANIMATION_BASE_STATES.Done,
      overlay: AGENT_ANIMATION_OVERLAYS.Success,
    };
    return;
  }

  if (isCompactionSubtype(subtype)) {
    const preTokens = system.compactMetadata?.preTokens;
    if (typeof preTokens === "number" && Number.isFinite(preTokens)) {
      acc.compactionPreTokens = Math.max(acc.compactionPreTokens, preTokens);
    }
    markActivity(acc, eventAtMs, {
      baseState: AGENT_ANIMATION_BASE_STATES.Attention,
      overlay: AGENT_ANIMATION_OVERLAYS.Compacting,
    });
  }
}

function applyProgressEntry(
  acc: Accumulator,
  entry: ClaudeTranscriptEntry,
  eventAtMs: number
): void {
  const progress = progressRecord(entry);
  if (!progress) return;

  if (progress.kind === "agent_progress") {
    const parentToolId = progress.parentToolUseID ?? progress.toolUseID;
    if (parentToolId) {
      acc.activeForegroundSubagents.add(parentToolId);
      markActivity(acc, eventAtMs, {
        baseState: AGENT_ANIMATION_BASE_STATES.Working,
        overlay: AGENT_ANIMATION_OVERLAYS.Subagent,
      });
    }
    return;
  }

  if (progress.kind === "skill_loaded") {
    markActivity(acc, eventAtMs, {
      baseState: AGENT_ANIMATION_BASE_STATES.Working,
      overlay: AGENT_ANIMATION_OVERLAYS.SkillLoaded,
    });
  }
}

function resolvePendingPermissions(acc: Accumulator, nowMs: number): number | null {
  let nextPermissionCheckAtMs: number | null = null;
  for (const pending of acc.pendingTools.values()) {
    const dueAtMs = pending.observedAtMs + AGENT_ANIMATION_PERMISSION_TIMEOUT_MS;
    if (nowMs >= dueAtMs) {
      acc.sawRelevantRecord = true;
      acc.stopped = false;
      acc.lastEventAtMs = Math.max(acc.lastEventAtMs ?? dueAtMs, dueAtMs);
      acc.pose = {
        baseState: AGENT_ANIMATION_BASE_STATES.Attention,
        overlay: AGENT_ANIMATION_OVERLAYS.Permission,
      };
    } else {
      nextPermissionCheckAtMs =
        nextPermissionCheckAtMs === null ? dueAtMs : Math.min(nextPermissionCheckAtMs, dueAtMs);
    }
  }
  return nextPermissionCheckAtMs;
}

function applySubagentOverlay(acc: Accumulator, subagentCount: number): void {
  if (subagentCount === 0) return;
  if (OVERLAY_PRIORITY[acc.pose.overlay] > OVERLAY_PRIORITY[AGENT_ANIMATION_OVERLAYS.Subagent]) {
    return;
  }
  acc.sawRelevantRecord = true;
  acc.stopped = false;
  acc.pose = {
    baseState: AGENT_ANIMATION_BASE_STATES.Working,
    overlay: AGENT_ANIMATION_OVERLAYS.Subagent,
  };
}

function buildSnapshot(
  input: AgentAnimationDeriveInput,
  acc: Accumulator,
  nowMs: number,
  subagentCount: number
): AgentAnimationSnapshot {
  const activeAgeMs =
    acc.firstActivityAtMs === null
      ? 0
      : Math.max(0, nowMs - Math.min(acc.firstActivityAtMs, nowMs));
  const fatigueLevel = deriveFatigueLevel(
    acc.maxContextTokens,
    acc.compactionPreTokens,
    activeAgeMs
  );
  const isActive = computeIsActive(acc, subagentCount);

  return {
    agentId: input.agentId,
    projectId: input.projectId,
    baseState: acc.pose.baseState,
    overlay: acc.pose.overlay,
    fatigueLevel,
    activeSessionIds: isActive ? [input.sessionId] : [],
    subagentCount,
    lastEventAt: new Date(acc.lastEventAtMs ?? nowMs).toISOString(),
  };
}

function computeIsActive(acc: Accumulator, subagentCount: number): boolean {
  if (acc.stopped) return false;
  if (acc.pendingTools.size > 0 || subagentCount > 0) return true;
  const state = acc.pose.baseState;
  return (
    state === AGENT_ANIMATION_BASE_STATES.Working ||
    state === AGENT_ANIMATION_BASE_STATES.Attention ||
    state === AGENT_ANIMATION_BASE_STATES.Failed
  );
}

export function mergeAgentAnimationSnapshots(
  snapshots: readonly AgentAnimationSnapshot[]
): AgentAnimationSnapshot | null {
  if (snapshots.length === 0) return null;

  const latest = latestSnapshot(snapshots);
  const aggregate = aggregateSnapshots(snapshots);

  return {
    ...latest,
    baseState: promoteBaseState(latest.baseState, aggregate.subagentCount),
    overlay: promoteOverlay(latest.overlay, aggregate.subagentCount),
    fatigueLevel: aggregate.fatigueLevel,
    activeSessionIds: [...aggregate.activeSessionIds].sort(),
    subagentCount: aggregate.subagentCount,
  };
}

function latestSnapshot(snapshots: readonly AgentAnimationSnapshot[]): AgentAnimationSnapshot {
  let latest = snapshots[0];
  for (const snapshot of snapshots.slice(1)) {
    if (snapshot.lastEventAt > latest.lastEventAt) {
      latest = snapshot;
    }
  }
  return latest;
}

interface SnapshotAggregate {
  readonly activeSessionIds: ReadonlySet<string>;
  readonly subagentCount: number;
  readonly fatigueLevel: AgentFatigueLevel;
}

function aggregateSnapshots(snapshots: readonly AgentAnimationSnapshot[]): SnapshotAggregate {
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
  return { activeSessionIds, subagentCount, fatigueLevel };
}

function promoteOverlay(
  overlay: AgentAnimationOverlay,
  subagentCount: number
): AgentAnimationOverlay {
  if (subagentCount > 0 && overlay === AGENT_ANIMATION_OVERLAYS.None) {
    return AGENT_ANIMATION_OVERLAYS.Subagent;
  }
  return overlay;
}

function promoteBaseState(
  baseState: AgentAnimationBaseState,
  subagentCount: number
): AgentAnimationBaseState {
  if (subagentCount > 0 && baseState === AGENT_ANIMATION_BASE_STATES.Sleeping) {
    return AGENT_ANIMATION_BASE_STATES.Working;
  }
  return baseState;
}

function arrayContent(
  content: ClaudeAssistantEntry["message"]["content"] | undefined
): readonly ClaudeContentBlock[] | null {
  // `Array.isArray`'s built-in guard widens `readonly ClaudeContentBlock[]`
  // to `any[]`, which defeats type-aware lint rules downstream. Preserve the
  // element type explicitly.
  return Array.isArray(content) ? (content as readonly ClaudeContentBlock[]) : null;
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

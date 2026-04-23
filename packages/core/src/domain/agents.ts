import type { JsonObject, MetadataCarrier } from "./common.js";

export const AGENT_RUNTIMES = {
  Claude: "claude",
  OpenAI: "openai",
  Local: "local",
  Custom: "custom",
} as const;

export type AgentRuntime = (typeof AGENT_RUNTIMES)[keyof typeof AGENT_RUNTIMES];

export const AGENT_KINDS = {
  Interactive: "interactive",
  Worker: "worker",
  System: "system",
} as const;

export type AgentKind = (typeof AGENT_KINDS)[keyof typeof AGENT_KINDS];

export const AGENT_STATUSES = {
  Available: "available",
  Busy: "busy",
  Offline: "offline",
  Error: "error",
} as const;

export type AgentStatus = (typeof AGENT_STATUSES)[keyof typeof AGENT_STATUSES];

export interface AgentDescriptor extends MetadataCarrier {
  readonly id: string;
  readonly runtime: AgentRuntime;
  readonly kind: AgentKind;
  readonly displayName: string;
  readonly version?: string;
  readonly capabilities: readonly string[];
  readonly labels?: readonly string[];
}

export interface AgentRuntimeDescriptor {
  readonly runtime: AgentRuntime;
  readonly displayName: string;
  readonly defaultModel?: string;
  readonly supportsMultipleSessions: boolean;
}

export interface AgentState extends MetadataCarrier {
  readonly agentId: string;
  readonly status: AgentStatus;
  readonly activeSessionIds: readonly string[];
  readonly lastSeenAt?: string;
  readonly statusMessage?: string;
}

export interface AgentHeartbeat {
  readonly agentId: string;
  readonly observedAt: string;
  readonly status: AgentStatus;
  readonly load?: AgentLoad;
}

export interface AgentLoad {
  readonly activeSessions: number;
  readonly queuedSessions?: number;
  readonly usage?: JsonObject;
}

export const AGENT_ANIMATION_BASE_STATES = {
  Sleeping: "sleeping",
  Working: "working",
  Attention: "attention",
  Done: "done",
  Failed: "failed",
} as const;

export type AgentAnimationBaseState =
  (typeof AGENT_ANIMATION_BASE_STATES)[keyof typeof AGENT_ANIMATION_BASE_STATES];

export const AGENT_ANIMATION_OVERLAYS = {
  None: "none",
  Success: "success",
  Failure: "failure",
  Permission: "permission",
  Compacting: "compacting",
  SkillLoaded: "skillLoaded",
  Subagent: "subagent",
} as const;

export type AgentAnimationOverlay =
  (typeof AGENT_ANIMATION_OVERLAYS)[keyof typeof AGENT_ANIMATION_OVERLAYS];

export const AGENT_FATIGUE_LEVELS = {
  Fresh: "fresh",
  SlightlyTired: "slightly_tired",
  Tired: "tired",
  Exhausted: "exhausted",
} as const;

export type AgentFatigueLevel = (typeof AGENT_FATIGUE_LEVELS)[keyof typeof AGENT_FATIGUE_LEVELS];

/**
 * Canonical live animation state for a rendered agent mascot. This is
 * intentionally separate from durable `AgentState.status`: it describes the
 * current browser animation pose derived from transcript activity, not a
 * persisted runtime health state.
 */
export interface AgentAnimationSnapshot {
  readonly agentId: string;
  readonly projectId: string;
  readonly baseState: AgentAnimationBaseState;
  readonly overlay: AgentAnimationOverlay;
  readonly fatigueLevel: AgentFatigueLevel;
  readonly activeSessionIds: readonly string[];
  readonly subagentCount: number;
  readonly lastEventAt: string;
}

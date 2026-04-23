import type { JsonObject, MetadataCarrier } from "./common.js";

export const AGENT_RUNTIMES = {
  Claude: "claude",
  OpenAI: "openai",
  Local: "local",
  Custom: "custom"
} as const;

export type AgentRuntime = (typeof AGENT_RUNTIMES)[keyof typeof AGENT_RUNTIMES];

export const AGENT_KINDS = {
  Interactive: "interactive",
  Worker: "worker",
  System: "system"
} as const;

export type AgentKind = (typeof AGENT_KINDS)[keyof typeof AGENT_KINDS];

export const AGENT_STATUSES = {
  Available: "available",
  Busy: "busy",
  Offline: "offline",
  Error: "error"
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

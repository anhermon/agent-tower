import type {
  AgentDescriptor,
  AgentState,
  ChannelMessage,
  SessionDescriptor,
  SessionTurn,
} from "@control-plane/core";
import {
  AGENT_KINDS,
  AGENT_RUNTIMES,
  AGENT_STATUSES,
  CHANNEL_KINDS,
  CHANNEL_MESSAGE_DIRECTIONS,
  CLAUDE_FIRST_CAPABILITIES,
  SESSION_ACTOR_ROLES,
  SESSION_STATES,
} from "@control-plane/core";

export const mockClaudeAgent = {
  id: "agent_claude_fixture",
  runtime: AGENT_RUNTIMES.Claude,
  kind: AGENT_KINDS.Interactive,
  displayName: "Fixture Claude Agent",
  version: "fixture",
  capabilities: CLAUDE_FIRST_CAPABILITIES,
  labels: ["fixture", "claude"],
} as const satisfies AgentDescriptor;

export const mockClaudeAgentState = {
  agentId: mockClaudeAgent.id,
  status: AGENT_STATUSES.Available,
  activeSessionIds: [],
  lastSeenAt: "2026-01-01T00:00:00.000Z",
} as const satisfies AgentState;

export const mockSession = {
  id: "session_fixture_001",
  agentId: mockClaudeAgent.id,
  runtime: AGENT_RUNTIMES.Claude,
  state: SESSION_STATES.Running,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  title: "Fixture session",
  channel: {
    kind: CHANNEL_KINDS.Api,
    id: "api_fixture",
  },
} as const satisfies SessionDescriptor;

export const mockUserTurn = {
  id: "turn_fixture_001",
  sessionId: mockSession.id,
  sequence: 1,
  actor: {
    role: SESSION_ACTOR_ROLES.User,
    id: "user_fixture",
    displayName: "Fixture User",
  },
  content: {
    kind: "text",
    text: "Summarize the current control-plane status.",
  },
  createdAt: "2026-01-01T00:00:01.000Z",
} as const satisfies SessionTurn;

export const mockInboundChannelMessage = {
  id: "message_fixture_001",
  channel: {
    kind: CHANNEL_KINDS.Api,
    id: "api_fixture",
  },
  direction: CHANNEL_MESSAGE_DIRECTIONS.Inbound,
  createdAt: "2026-01-01T00:00:01.000Z",
  sender: {
    id: "identity_fixture_001",
    channel: {
      kind: CHANNEL_KINDS.Api,
      id: "api_fixture",
    },
    displayName: "Fixture User",
    externalUserId: "user_fixture",
  },
  text: "Summarize the current control-plane status.",
  correlationId: "corr_fixture_001",
} as const satisfies ChannelMessage;

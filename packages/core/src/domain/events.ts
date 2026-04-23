import type { AgentState } from "./agents.js";
import type { JsonObject, JsonValue, MetadataCarrier } from "./common.js";
import type { CostEstimate, CostLineItem } from "./costs.js";
import type { McpServerDescriptor } from "./mcps.js";
import type { ReplayResult } from "./replay.js";
import type { SessionDescriptor, SessionStateTransition, SessionTurn } from "./sessions.js";
import type { TicketRecord } from "./tickets.js";
import type { ToolCall, ToolResult } from "./tools.js";
import type { WebhookDelivery } from "./webhooks.js";

export const DOMAIN_EVENT_TYPES = {
  AgentRegistered: "agent.registered",
  AgentStateChanged: "agent.state_changed",
  SessionCreated: "session.created",
  SessionStateChanged: "session.state_changed",
  SessionTurnCreated: "session.turn_created",
  ToolCallCreated: "tool_call.created",
  ToolCallCompleted: "tool_call.completed",
  CostEstimated: "cost.estimated",
  CostRecorded: "cost.recorded",
  TicketChanged: "ticket.changed",
  McpServerChanged: "mcp.server_changed",
  WebhookDeliveryChanged: "webhook.delivery_changed",
  ReplayCompleted: "replay.completed",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

export interface DomainEventEnvelope<
  TType extends DomainEventType = DomainEventType,
  TPayload extends JsonValue | object = JsonObject,
> extends MetadataCarrier {
  readonly id: string;
  readonly type: TType;
  readonly occurredAt: string;
  readonly payload: TPayload;
  readonly aggregateId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export type AgentEvent =
  | DomainEventEnvelope<"agent.registered", { readonly agentId: string }>
  | DomainEventEnvelope<"agent.state_changed", AgentState>;

export type SessionEvent =
  | DomainEventEnvelope<"session.created", SessionDescriptor>
  | DomainEventEnvelope<"session.state_changed", SessionStateTransition>
  | DomainEventEnvelope<"session.turn_created", SessionTurn>;

export type ToolEvent =
  | DomainEventEnvelope<"tool_call.created", ToolCall>
  | DomainEventEnvelope<"tool_call.completed", ToolResult>;

export type CostEvent =
  | DomainEventEnvelope<"cost.estimated", CostEstimate>
  | DomainEventEnvelope<"cost.recorded", CostLineItem>;

export type TicketEvent = DomainEventEnvelope<"ticket.changed", TicketRecord>;

export type McpEvent = DomainEventEnvelope<"mcp.server_changed", McpServerDescriptor>;

export type WebhookEvent = DomainEventEnvelope<"webhook.delivery_changed", WebhookDelivery>;

export type ReplayEvent = DomainEventEnvelope<"replay.completed", ReplayResult>;

export type DomainEvent =
  | AgentEvent
  | SessionEvent
  | ToolEvent
  | CostEvent
  | TicketEvent
  | McpEvent
  | WebhookEvent
  | ReplayEvent;

export interface EventCursor {
  readonly value: string;
  readonly eventId?: string;
  readonly occurredAt?: string;
}

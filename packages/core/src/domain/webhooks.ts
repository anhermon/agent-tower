import type { JsonObject, MetadataCarrier } from "./common.js";

export const WEBHOOK_EVENT_TYPES = {
  AgentChanged: "agent.changed",
  SessionChanged: "session.changed",
  SessionTurnCreated: "session.turn_created",
  ToolCallChanged: "tool_call.changed",
  CostRecorded: "cost.recorded",
  TicketChanged: "ticket.changed",
  ReplayCompleted: "replay.completed"
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[keyof typeof WEBHOOK_EVENT_TYPES];

export interface WebhookSubscription extends MetadataCarrier {
  readonly id: string;
  /**
   * Optional human-friendly label shown alongside the URL in operator UIs.
   * Display-only — adapters may omit it. The URL remains the canonical
   * target identifier.
   */
  readonly displayName?: string;
  readonly url: string;
  readonly eventTypes: readonly WebhookEventType[];
  readonly enabled: boolean;
  readonly secretRef?: string;
  readonly createdAt: string;
}

export interface WebhookDelivery extends MetadataCarrier {
  readonly id: string;
  readonly subscriptionId: string;
  readonly eventType: WebhookEventType;
  readonly attemptedAt: string;
  readonly status: "pending" | "delivered" | "failed";
  readonly responseStatus?: number;
  readonly responseBody?: string;
  readonly requestHeaders?: JsonObject;
}

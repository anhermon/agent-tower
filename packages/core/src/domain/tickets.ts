import type { MetadataCarrier } from "./common.js";

export const TICKET_STATUSES = {
  Open: "open",
  InProgress: "in_progress",
  Blocked: "blocked",
  Resolved: "resolved",
  Closed: "closed"
} as const;

export type TicketStatus = (typeof TICKET_STATUSES)[keyof typeof TICKET_STATUSES];

export const TICKET_PRIORITIES = {
  Low: "low",
  Normal: "normal",
  High: "high",
  Urgent: "urgent"
} as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[keyof typeof TICKET_PRIORITIES];

export interface TicketRecord extends MetadataCarrier {
  readonly id: string;
  readonly title: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly description?: string;
  readonly assigneeAgentId?: string;
  readonly sessionId?: string;
  readonly externalUrl?: string;
}

export interface TicketLink {
  readonly ticketId: string;
  readonly targetType: "session" | "agent" | "tool_call" | "event";
  readonly targetId: string;
  readonly createdAt: string;
}

import type { TicketStatus } from "../domain/tickets.js";

/**
 * Context passed to an AgentWakeAdapter when a ticket transitions lanes.
 * All fields use canonical agent-tower types — no vendor identifiers.
 */
export interface AgentWakeContext {
  readonly ticketId: string;
  readonly assigneeAgentId: string;
  readonly previousStatus: TicketStatus;
  readonly newStatus: TicketStatus;
  readonly triggeredAt: string;
}

/**
 * Adapter that notifies an assigned agent when its ticket moves to a new lane.
 *
 * Implementations must never throw — they should catch errors internally and
 * log/ignore them so a failed wake does not break the ticket mutation.
 *
 * Two implementations ship in apps/web/lib/kanban-wake.ts:
 *   - WebhookAgentWakeAdapter — fires a POST to CLAUDE_CONTROL_PLANE_KANBAN_WAKE_WEBHOOK_URL
 *   - NoopAgentWakeAdapter    — does nothing (used when the env var is absent)
 */
export interface AgentWakeAdapter {
  wake(context: AgentWakeContext): Promise<void>;
}

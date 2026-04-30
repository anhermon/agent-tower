import "server-only";

import type { AgentWakeAdapter, AgentWakeContext } from "@control-plane/core";
import { getLogger } from "@control-plane/logger";

/**
 * Environment variable that, when set, enables agent wake on ticket moves.
 *
 * Value: a URL that receives a POST request with an {@link AgentWakeContext}
 * JSON body whenever a ticket is moved to a new lane and has an assignee.
 *
 * The consumer is responsible for routing — this module fires a single HTTP
 * POST with no Paperclip-specific knowledge. A Paperclip user could point
 * this at a Paperclip webhook URL; a different runtime could use any endpoint.
 */
export const KANBAN_WAKE_WEBHOOK_URL_ENV = "CLAUDE_CONTROL_PLANE_KANBAN_WAKE_WEBHOOK_URL";

const log = getLogger("kanban-wake");

// ---------------------------------------------------------------------------
// Webhook implementation
// ---------------------------------------------------------------------------

/**
 * Fires a POST to {@link KANBAN_WAKE_WEBHOOK_URL_ENV} with the wake context.
 * Errors are caught and logged; they never propagate to the caller.
 */
export class WebhookAgentWakeAdapter implements AgentWakeAdapter {
  constructor(private readonly webhookUrl: string) {}

  async wake(context: AgentWakeContext): Promise<void> {
    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "(no body)");
        log.warn(
          { statusCode: res.status, ticketId: context.ticketId, agentId: context.assigneeAgentId },
          `wake webhook returned ${res.status}: ${text}`
        );
      } else {
        log.info(
          { ticketId: context.ticketId, agentId: context.assigneeAgentId },
          "wake webhook fired"
        );
      }
    } catch (err) {
      log.warn(
        { err, ticketId: context.ticketId, agentId: context.assigneeAgentId },
        "wake webhook request failed"
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Noop implementation (used when webhook URL is not configured)
// ---------------------------------------------------------------------------

export class NoopAgentWakeAdapter implements AgentWakeAdapter {
  async wake(_context: AgentWakeContext): Promise<void> {
    // Intentionally does nothing
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Resolves the adapter from env. Returns WebhookAgentWakeAdapter if the URL
 *  is set; NoopAgentWakeAdapter otherwise. */
export function resolveWakeAdapter(): AgentWakeAdapter {
  const url = process.env[KANBAN_WAKE_WEBHOOK_URL_ENV]?.trim();
  if (url) return new WebhookAgentWakeAdapter(url);
  return new NoopAgentWakeAdapter();
}

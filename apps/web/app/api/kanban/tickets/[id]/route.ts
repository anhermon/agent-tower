/**
 * PATCH /api/kanban/tickets/:id — update a ticket's status, assignee, or session link.
 *
 * Used by agents to move tickets through the workflow:
 *   - Set status to `in_progress` when starting work.
 *   - Set sessionId to link the active Claude Code session.
 *   - Set status to `blocked` or `resolved` when appropriate.
 *
 * Returns the updated TicketRecord on success.
 */
import { TICKET_STATUSES } from "@control-plane/core";

import { ticketStore } from "@/lib/ticket-store";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATUSES = new Set(Object.values(TICKET_STATUSES));

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function updateTicket(request: Request, ctx?: unknown): Promise<Response> {
  const { id } = await (ctx as RouteContext).params;

  const existing = await ticketStore.getById(id);
  if (!existing) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "body_must_be_object" }, { status: 400 });
  }

  const patch: Record<string, string> = {};

  const status = body.status;
  if (status !== undefined) {
    if (typeof status !== "string" || !VALID_STATUSES.has(status as never)) {
      return Response.json(
        { ok: false, error: "invalid_status", valid: Array.from(VALID_STATUSES) },
        { status: 400 }
      );
    }
    patch.status = status;
  }

  if (typeof body.assigneeAgentId === "string") {
    patch.assigneeAgentId = body.assigneeAgentId;
  }

  if (typeof body.sessionId === "string") {
    patch.sessionId = body.sessionId;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json(
      {
        ok: false,
        error: "no_fields_to_update",
        allowed: ["status", "assigneeAgentId", "sessionId"],
      },
      { status: 400 }
    );
  }

  const updated = await ticketStore.update(id, patch);
  return Response.json({ ok: true, ticket: updated });
}

export const PATCH = withAudit("PATCH /api/kanban/tickets/:id", updateTicket);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

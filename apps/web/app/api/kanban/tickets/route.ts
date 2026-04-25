/**
 * GET  /api/kanban/tickets        — list all tickets from the in-memory store.
 * POST /api/kanban/tickets        — create a new ticket.
 *
 * Used by the Kanban board UI (server-side) and by agents bootstrapping their
 * work queue. For per-agent filtering see GET /api/kanban/queue.
 */
import { TICKET_PRIORITIES } from "@control-plane/core";

import { ticketStore } from "@/lib/ticket-store";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PRIORITIES = new Set(Object.values(TICKET_PRIORITIES));

async function listTickets(_request: Request): Promise<Response> {
  const tickets = await ticketStore.list();
  return Response.json({ ok: true, tickets });
}

async function createTicket(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "body_must_be_object" }, { status: 400 });
  }

  const title = body.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    return Response.json({ ok: false, error: "title_required" }, { status: 400 });
  }

  const priority = body.priority;
  if (
    priority !== undefined &&
    (typeof priority !== "string" || !VALID_PRIORITIES.has(priority as never))
  ) {
    return Response.json(
      { ok: false, error: "invalid_priority", valid: Array.from(VALID_PRIORITIES) },
      { status: 400 }
    );
  }

  const description = typeof body.description === "string" ? body.description : undefined;
  const assigneeAgentId =
    typeof body.assigneeAgentId === "string" ? body.assigneeAgentId : undefined;

  const ticket = await ticketStore.create({
    title: title.trim(),
    ...(description !== undefined ? { description } : {}),
    ...(priority !== undefined
      ? { priority: priority as (typeof TICKET_PRIORITIES)[keyof typeof TICKET_PRIORITIES] }
      : {}),
    ...(assigneeAgentId !== undefined ? { assigneeAgentId } : {}),
  });

  return Response.json({ ok: true, ticket }, { status: 201 });
}

export const GET = withAudit("GET /api/kanban/tickets", listTickets);
export const POST = withAudit("POST /api/kanban/tickets", createTicket);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

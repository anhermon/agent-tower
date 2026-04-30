import "server-only";

import { TICKET_PRIORITIES, type TicketPriority } from "@control-plane/core";

import { createTicket, listTickets } from "@/lib/kanban-store";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/kanban/tickets
 * List tickets from the local tickets file.
 */
export const GET = withAudit(
  "api.kanban.tickets.list",
  async (_req: Request): Promise<Response> => {
    const result = await listTickets();
    if (!result.ok) {
      const status = result.reason === "unconfigured" ? 503 : 502;
      return Response.json(
        { ok: false, reason: result.reason, message: result.message },
        { status }
      );
    }
    return Response.json({ ok: true, tickets: result.tickets });
  }
);

/**
 * POST /api/kanban/tickets
 * Create a new ticket in the local tickets file.
 *
 * Body: { title, description?, priority?, assigneeAgentId? }
 */
export const POST = withAudit(
  "api.kanban.tickets.create",
  async (req: Request): Promise<Response> => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { ok: false, reason: "bad_request", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    if (!isRecord(body)) {
      return Response.json(
        { ok: false, reason: "bad_request", message: "Body must be an object" },
        { status: 400 }
      );
    }

    const title = body.title;
    if (typeof title !== "string" || title.trim().length === 0) {
      return Response.json(
        { ok: false, reason: "bad_request", message: "title is required" },
        { status: 400 }
      );
    }

    const description = typeof body.description === "string" ? body.description : undefined;
    const assigneeAgentId =
      typeof body.assigneeAgentId === "string" ? body.assigneeAgentId : undefined;
    const rawPriority = body.priority;
    const priority = isValidPriority(rawPriority) ? rawPriority : TICKET_PRIORITIES.Normal;

    const result = await createTicket({
      title: title.trim(),
      description,
      priority,
      assigneeAgentId,
    });

    if (!result.ok) {
      const status = result.reason === "unconfigured" ? 503 : 502;
      return Response.json(
        { ok: false, reason: result.reason, message: result.message },
        { status }
      );
    }
    return Response.json({ ok: true, ticket: result.ticket }, { status: 201 });
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const VALID_PRIORITIES = new Set<string>(Object.values(TICKET_PRIORITIES));

function isValidPriority(v: unknown): v is TicketPriority {
  return typeof v === "string" && VALID_PRIORITIES.has(v);
}

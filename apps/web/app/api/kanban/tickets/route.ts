import "server-only";

import { TICKET_PRIORITIES, TICKET_STATUSES, type TicketPriority } from "@control-plane/core";

import {
  createPaperclipTicket,
  listPaperclipTickets,
  resolvePaperclipEnv,
} from "@/lib/paperclip-kanban";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/kanban/tickets
 * List Paperclip issues mapped to canonical TicketRecord.
 * Query params: projectId (optional)
 */
export const GET = withAudit("api.kanban.tickets.list", async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;

  const result = await listPaperclipTickets(projectId);
  if (!result.ok) {
    const status = result.reason === "unconfigured" ? 503 : 502;
    return Response.json({ ok: false, reason: result.reason, message: result.message }, { status });
  }
  return Response.json({ ok: true, tickets: result.tickets });
});

/**
 * POST /api/kanban/tickets
 * Create a new Paperclip issue.
 *
 * Body: { title, description?, priority?, assigneeAgentId?, projectId? }
 */
export const POST = withAudit(
  "api.kanban.tickets.create",
  async (req: Request): Promise<Response> => {
    const envResult = resolvePaperclipEnv();
    if (!envResult.ok) {
      return Response.json(
        { ok: false, reason: "unconfigured", message: envResult.reason },
        { status: 503 }
      );
    }

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
    const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    const rawPriority = body.priority;
    const priority = isValidPriority(rawPriority) ? rawPriority : TICKET_PRIORITIES.Normal;

    const result = await createPaperclipTicket({
      title: title.trim(),
      description,
      priority,
      assigneeAgentId,
      projectId,
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, reason: result.reason, message: result.message },
        { status: 502 }
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
const VALID_STATUSES = new Set<string>(Object.values(TICKET_STATUSES));

function isValidPriority(v: unknown): v is TicketPriority {
  return typeof v === "string" && VALID_PRIORITIES.has(v);
}

// Re-export for route.test.ts
export { VALID_STATUSES };

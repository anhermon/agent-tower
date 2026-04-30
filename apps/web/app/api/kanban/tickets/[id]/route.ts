import "server-only";

import { TICKET_STATUSES, type TicketStatus } from "@control-plane/core";

import {
  assignPaperclipTicket,
  movePaperclipTicket,
  resolvePaperclipEnv,
} from "@/lib/paperclip-kanban";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/kanban/tickets/:id
 * Update a ticket — assign an agent or move to a new status (or both).
 *
 * Body (all fields optional, at least one required):
 *   { assigneeAgentId?: string, status?: TicketStatus }
 */
async function ticketPatchHandler(req: Request, ctx?: unknown): Promise<Response> {
  const envResult = resolvePaperclipEnv();
  if (!envResult.ok) {
    return Response.json(
      { ok: false, reason: "unconfigured", message: envResult.reason },
      { status: 503 }
    );
  }

  // Next.js 15: params arrive as a Promise in the route context.
  const rawCtx = ctx as { params?: Promise<{ id?: string }> | { id?: string } } | undefined;
  const paramsResolved = rawCtx?.params instanceof Promise ? await rawCtx.params : rawCtx?.params;
  const rawId = paramsResolved?.id ?? "";
  const decodedId = safeDecode(rawId);

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

  const newStatus = body.status;
  const newAgentId = body.assigneeAgentId;

  if (newStatus === undefined && newAgentId === undefined) {
    return Response.json(
      { ok: false, reason: "bad_request", message: "Provide status or assigneeAgentId" },
      { status: 400 }
    );
  }

  // Move first (status change), then assign if requested
  if (newStatus !== undefined) {
    if (!isValidStatus(newStatus)) {
      return Response.json(
        {
          ok: false,
          reason: "bad_request",
          message: `Invalid status "${typeof newStatus === "string" ? newStatus : "(invalid)"}". Valid: ${Object.values(TICKET_STATUSES).join(", ")}`,
        },
        { status: 400 }
      );
    }
    const moveResult = await movePaperclipTicket(decodedId, newStatus as TicketStatus);
    if (!moveResult.ok) {
      return Response.json(
        { ok: false, reason: moveResult.reason, message: moveResult.message },
        { status: 502 }
      );
    }
    if (newAgentId === undefined) {
      return Response.json({ ok: true, ticket: moveResult.ticket });
    }
  }

  if (newAgentId !== undefined) {
    if (typeof newAgentId !== "string" || newAgentId.trim().length === 0) {
      return Response.json(
        { ok: false, reason: "bad_request", message: "assigneeAgentId must be a non-empty string" },
        { status: 400 }
      );
    }
    const assignResult = await assignPaperclipTicket(decodedId, newAgentId.trim());
    if (!assignResult.ok) {
      return Response.json(
        { ok: false, reason: assignResult.reason, message: assignResult.message },
        { status: 502 }
      );
    }
    return Response.json({ ok: true, ticket: assignResult.ticket });
  }

  return Response.json(
    { ok: false, reason: "bad_request", message: "Nothing to update" },
    { status: 400 }
  );
}

export const PATCH = withAudit("api.kanban.tickets.update", ticketPatchHandler);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const VALID_STATUSES = new Set<string>(Object.values(TICKET_STATUSES));

function isValidStatus(v: unknown): boolean {
  return typeof v === "string" && VALID_STATUSES.has(v);
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

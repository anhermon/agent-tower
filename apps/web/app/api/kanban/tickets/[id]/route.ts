import "server-only";

import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@control-plane/core";

import { updateTicket } from "@/lib/kanban-store";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/kanban/tickets/:id
 * Update a ticket — assign an agent, move to a new status, or change priority.
 *
 * Body (all fields optional, at least one required):
 *   { assigneeAgentId?: string, status?: TicketStatus, priority?: TicketPriority }
 *
 * Moving a ticket to a new status fires the configured AgentWakeAdapter if:
 *   - the ticket has an assignee
 *   - CLAUDE_CONTROL_PLANE_KANBAN_WAKE_WEBHOOK_URL is set in the environment
 */
async function ticketPatchHandler(req: Request, ctx?: unknown): Promise<Response> {
  const id = await resolveId(ctx);
  if (!id) {
    return Response.json(
      { ok: false, reason: "bad_request", message: "Missing ticket id" },
      { status: 400 }
    );
  }

  const bodyResult = await parseBody(req);
  if (!bodyResult.ok) return bodyResult.response;

  const result = await updateTicket(id, bodyResult.patch);
  if (!result.ok) {
    const httpStatus =
      result.reason === "not_found" ? 404 : result.reason === "unconfigured" ? 503 : 502;
    return Response.json(
      { ok: false, reason: result.reason, message: result.message },
      { status: httpStatus }
    );
  }
  return Response.json({ ok: true, ticket: result.ticket });
}

export const PATCH = withAudit("api.kanban.tickets.update", ticketPatchHandler);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedPatch {
  status?: TicketStatus;
  assigneeAgentId?: string;
  priority?: TicketPriority;
}

type ParseBodyResult =
  | { readonly ok: true; readonly patch: ParsedPatch }
  | { readonly ok: false; readonly response: Response };

async function parseBody(req: Request): Promise<ParseBodyResult> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  if (!isRecord(body)) return bad("Body must be an object");

  const rawStatus = body.status;
  const rawAgentId = body.assigneeAgentId;
  const rawPriority = body.priority;

  if (rawStatus === undefined && rawAgentId === undefined && rawPriority === undefined) {
    return bad("Provide status, assigneeAgentId, or priority");
  }
  if (rawStatus !== undefined && !isValidStatus(rawStatus)) {
    return bad(
      `Invalid status "${typeof rawStatus === "string" ? rawStatus : "(invalid)"}". Valid: ${Object.values(TICKET_STATUSES).join(", ")}`
    );
  }
  if (rawAgentId !== undefined && (typeof rawAgentId !== "string" || !rawAgentId.trim())) {
    return bad("assigneeAgentId must be a non-empty string");
  }
  if (rawPriority !== undefined && !isValidPriority(rawPriority)) {
    return bad("Invalid priority");
  }

  const patch: ParsedPatch = {};
  if (rawStatus !== undefined) patch.status = rawStatus as TicketStatus;
  if (rawAgentId !== undefined) patch.assigneeAgentId = rawAgentId.trim();
  if (rawPriority !== undefined) patch.priority = rawPriority as TicketPriority;
  return { ok: true, patch };
}

function bad(message: string): { ok: false; response: Response } {
  return {
    ok: false,
    response: Response.json({ ok: false, reason: "bad_request", message }, { status: 400 }),
  };
}

async function resolveId(ctx: unknown): Promise<string> {
  const rawCtx = ctx as { params?: Promise<{ id?: string }> | { id?: string } } | undefined;
  const paramsResolved = rawCtx?.params instanceof Promise ? await rawCtx.params : rawCtx?.params;
  const rawId = paramsResolved?.id ?? "";
  return safeDecode(rawId);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const VALID_STATUSES = new Set<string>(Object.values(TICKET_STATUSES));
const VALID_PRIORITIES = new Set<string>(Object.values(TICKET_PRIORITIES));

function isValidStatus(v: unknown): boolean {
  return typeof v === "string" && VALID_STATUSES.has(v);
}

function isValidPriority(v: unknown): boolean {
  return typeof v === "string" && VALID_PRIORITIES.has(v);
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

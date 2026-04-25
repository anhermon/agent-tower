/**
 * GET /api/kanban/queue?agentId=<id> — return tickets assigned to a specific agent.
 *
 * Agents poll this endpoint to discover their work queue. The response is ordered
 * by priority (urgent → high → normal → low) then by creation time (oldest first).
 *
 * Query params:
 *   agentId (required) — the agent's identifier.
 *   status  (optional) — filter by status; defaults to open + in_progress + blocked.
 */
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketRecord,
  type TicketStatus,
} from "@control-plane/core";

import { ticketStore } from "@/lib/ticket-store";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIORITY_ORDER: Record<string, number> = {
  [TICKET_PRIORITIES.Urgent]: 0,
  [TICKET_PRIORITIES.High]: 1,
  [TICKET_PRIORITIES.Normal]: 2,
  [TICKET_PRIORITIES.Low]: 3,
};

const DEFAULT_ACTIVE_STATUSES: readonly TicketStatus[] = [
  TICKET_STATUSES.Open,
  TICKET_STATUSES.InProgress,
  TICKET_STATUSES.Blocked,
];

const ALL_STATUSES = new Set(Object.values(TICKET_STATUSES));

async function getAgentQueue(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const agentId = url.searchParams.get("agentId");

  if (!agentId || agentId.trim().length === 0) {
    return Response.json({ ok: false, error: "agentId_required" }, { status: 400 });
  }

  const statusParam = url.searchParams.get("status");
  let statusFilter: readonly TicketStatus[];

  if (statusParam) {
    if (!ALL_STATUSES.has(statusParam as TicketStatus)) {
      return Response.json(
        { ok: false, error: "invalid_status", valid: Array.from(ALL_STATUSES) },
        { status: 400 }
      );
    }
    statusFilter = [statusParam as TicketStatus];
  } else {
    statusFilter = DEFAULT_ACTIVE_STATUSES;
  }

  const agentTickets = await ticketStore.listByAgentId(agentId.trim());
  const filtered = agentTickets.filter((t) => statusFilter.includes(t.status));
  const sorted = sortByPriorityThenAge(filtered);

  return Response.json({ ok: true, agentId: agentId.trim(), tickets: sorted });
}

export const GET = withAudit("GET /api/kanban/queue", getAgentQueue);

function sortByPriorityThenAge(tickets: readonly TicketRecord[]): readonly TicketRecord[] {
  return Array.from(tickets).sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

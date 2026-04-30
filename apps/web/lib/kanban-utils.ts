/**
 * Client-safe Kanban utilities — no Node.js filesystem imports.
 *
 * Extracted so that both server-only `kanban-source.ts` and the client
 * component `kanban-board-interactive.tsx` can share the lane constants and
 * grouping logic without pulling `node:fs` into the webpack client bundle.
 */

import { TICKET_STATUSES, type TicketRecord, type TicketStatus } from "@control-plane/core";

/** Canonical lane order for the board. */
export const KANBAN_LANE_ORDER: readonly TicketStatus[] = [
  TICKET_STATUSES.Open,
  TICKET_STATUSES.InProgress,
  TICKET_STATUSES.Blocked,
  TICKET_STATUSES.Resolved,
  TICKET_STATUSES.Closed,
];

export const KANBAN_LANE_LABELS: Record<TicketStatus, string> = {
  [TICKET_STATUSES.Open]: "Open",
  [TICKET_STATUSES.InProgress]: "In progress",
  [TICKET_STATUSES.Blocked]: "Blocked",
  [TICKET_STATUSES.Resolved]: "Resolved",
  [TICKET_STATUSES.Closed]: "Closed",
};

export function groupTicketsByStatus(
  tickets: readonly TicketRecord[]
): Record<TicketStatus, readonly TicketRecord[]> {
  const buckets: Record<TicketStatus, TicketRecord[]> = {
    [TICKET_STATUSES.Open]: [],
    [TICKET_STATUSES.InProgress]: [],
    [TICKET_STATUSES.Blocked]: [],
    [TICKET_STATUSES.Resolved]: [],
    [TICKET_STATUSES.Closed]: [],
  };
  for (const ticket of tickets) {
    buckets[ticket.status].push(ticket);
  }
  // Within a lane, order by updatedAt desc, then createdAt desc, then id.
  for (const status of KANBAN_LANE_ORDER) {
    buckets[status].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.id.localeCompare(b.id);
    });
  }
  return buckets;
}

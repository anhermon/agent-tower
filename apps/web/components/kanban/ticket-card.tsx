import Link from "next/link";

import type { TicketRecord } from "@control-plane/core";

import { TicketPriorityBadge } from "@/components/kanban/ticket-status-badge";
import { formatRelative, truncateMiddle } from "@/lib/format";

interface TicketCardProps {
  readonly ticket: TicketRecord;
}

export function TicketCard({ ticket }: TicketCardProps) {
  const href = `/kanban/${encodeURIComponent(ticket.id)}`;
  return (
    <Link
      href={href}
      className="glass-panel group block rounded-md p-4 transition-all hover:-translate-y-px hover:border-info/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{ticket.id}</p>
        <TicketPriorityBadge priority={ticket.priority} />
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-cyan">
        {ticket.title}
      </p>

      <dl className="mt-3 space-y-1.5 text-xs text-muted">
        {ticket.assigneeAgentId ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted/70">Agent</dt>
            <dd
              className="min-w-0 truncate font-mono text-[11px] text-muted"
              title={ticket.assigneeAgentId}
            >
              {truncateMiddle(ticket.assigneeAgentId, 28)}
            </dd>
          </div>
        ) : null}
        {ticket.sessionId ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted/70">Session</dt>
            <dd
              className="min-w-0 truncate font-mono text-[11px] text-muted"
              title={ticket.sessionId}
            >
              {truncateMiddle(ticket.sessionId, 28)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <dt className="text-muted/70">Created</dt>
          <dd className="text-ink/80">{formatRelative(ticket.createdAt)}</dd>
        </div>
      </dl>
    </Link>
  );
}

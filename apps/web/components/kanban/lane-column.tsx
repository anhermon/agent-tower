import type { TicketRecord, TicketStatus } from "@control-plane/core";

import { TicketCard } from "@/components/kanban/ticket-card";

interface LaneColumnProps {
  readonly status: TicketStatus;
  readonly label: string;
  readonly tickets: readonly TicketRecord[];
}

export function LaneColumn({ status, label, tickets }: LaneColumnProps) {
  return (
    <section
      aria-labelledby={`lane-${status}-title`}
      className="flex min-w-[260px] flex-1 flex-col gap-3 rounded-md border border-line/60 bg-panel/70 p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 id={`lane-${status}-title`} className="text-sm font-semibold text-ink">
          {label}
        </h2>
        <span className="font-mono text-xs text-muted/80">{tickets.length}</span>
      </header>
      {tickets.length === 0 ? (
        <div className="rounded-sm border border-dashed border-line/60 bg-white/[0.02] p-4 text-center text-xs text-muted">
          No tickets
        </div>
      ) : (
        <ul role="list" className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <TicketCard ticket={ticket} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { TICKET_STATUSES, type TicketRecord, type TicketStatus } from "@control-plane/core";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";
import {
  getConfiguredTicketsFile,
  listTicketsOrEmpty,
  TICKETS_FILE_ENV,
} from "@/lib/kanban-source";
import { ticketStore } from "@/lib/ticket-store";
import { getModuleByKey } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const mod = getModuleByKey("kanban");
  const configuredFile = getConfiguredTicketsFile();

  // Primary source: in-memory store (agent-created / agent-updated tickets).
  const storeTickets = await ticketStore.list();

  // Secondary source: optional static file for read-only seed data.
  const fileResult = configuredFile ? await listTicketsOrEmpty() : null;
  const fileError =
    fileResult && !fileResult.ok && fileResult.reason !== "unconfigured"
      ? fileResult.message
      : null;

  // Merge: store tickets win (already authoritative), file tickets fill the rest.
  const storeIds = new Set(storeTickets.map((t) => t.id));
  const fileTickets =
    fileResult?.ok === true ? fileResult.tickets.filter((t) => !storeIds.has(t.id)) : [];
  const tickets: readonly TicketRecord[] = [...storeTickets, ...fileTickets];

  const hasData = tickets.length > 0;
  const status = hasData ? "healthy" : "degraded";

  return (
    <section>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">{mod.label}</h1>
            <Badge state={status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Ticket-centric view of work flowing through the control plane. Agents poll{" "}
            <code className="font-mono text-xs">GET /api/kanban/queue?agentId=X</code> for their
            assigned work and update status via{" "}
            <code className="font-mono text-xs">PATCH /api/kanban/tickets/:id</code>.
          </p>
          {configuredFile ? (
            <p className="mt-2 font-mono text-xs text-muted/80" title={configuredFile}>
              seed file: {configuredFile}
            </p>
          ) : null}
          {fileError ? (
            <p className="mt-2 font-mono text-xs text-red-400">file error: {fileError}</p>
          ) : null}
        </div>
      </div>

      <KanbanBody tickets={tickets} configuredFile={configuredFile} />
    </section>
  );
}

interface KanbanBodyProps {
  readonly tickets: readonly TicketRecord[];
  readonly configuredFile: string | null;
}

function KanbanBody({ tickets, configuredFile }: KanbanBodyProps) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="No tickets"
        description={
          configuredFile
            ? "The in-memory store is empty and the configured tickets file contains no records."
            : `No tickets in the store yet. POST to /api/kanban/tickets to create one, or set ${TICKETS_FILE_ENV} to seed from a file.`
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SummaryStrip tickets={tickets} />
      <KanbanBoard tickets={tickets} />
    </div>
  );
}

function SummaryStrip({ tickets }: { readonly tickets: readonly TicketRecord[] }) {
  const counts = countByStatus(tickets);
  const items: readonly { readonly label: string; readonly value: number }[] = [
    { label: "Total", value: tickets.length },
    { label: "Open", value: counts[TICKET_STATUSES.Open] },
    { label: "In progress", value: counts[TICKET_STATUSES.InProgress] },
    { label: "Blocked", value: counts[TICKET_STATUSES.Blocked] },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-line bg-panel p-3 shadow-control">
          <dt className="text-xs uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function countByStatus(tickets: readonly TicketRecord[]): Record<TicketStatus, number> {
  const counts: Record<TicketStatus, number> = {
    [TICKET_STATUSES.Open]: 0,
    [TICKET_STATUSES.InProgress]: 0,
    [TICKET_STATUSES.Blocked]: 0,
    [TICKET_STATUSES.Resolved]: 0,
    [TICKET_STATUSES.Closed]: 0,
  };
  for (const ticket of tickets) {
    counts[ticket.status] += 1;
  }
  return counts;
}

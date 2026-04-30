import { TICKET_STATUSES, type TicketRecord, type TicketStatus } from "@control-plane/core";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { InteractiveKanbanBoard } from "@/components/kanban/kanban-board-interactive";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/state";
import {
  getConfiguredTicketsFile,
  type ListTicketsResult,
  listTicketsOrEmpty,
  TICKETS_FILE_ENV,
} from "@/lib/kanban-source";
import { getModuleByKey } from "@/lib/modules";
import { isPaperclipConfigured, resolvePaperclipEnv } from "@/lib/paperclip-kanban";

export const dynamic = "force-dynamic";

export default function KanbanPage() {
  const mod = getModuleByKey("kanban");
  const paperclipConfigured = isPaperclipConfigured();
  const configuredFile = getConfiguredTicketsFile();

  // Determine status badge
  const status = paperclipConfigured || configuredFile != null ? "healthy" : "degraded";

  // Resolve projectId for Paperclip mode (optional — narrows board to one project)
  const paperclipEnv = paperclipConfigured ? resolvePaperclipEnv() : null;
  const projectId = paperclipEnv?.ok ? (paperclipEnv.env.projectId ?? undefined) : undefined;

  return (
    <section>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">{mod.label}</h1>
            <Badge state={status} />
            {paperclipConfigured ? (
              <span className="rounded-full border border-info/40 bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                interactive
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {paperclipConfigured
              ? "Agent control plane — create, assign, and move Paperclip issues directly from the board. Moving a card to a new lane updates the issue status and wakes the assigned agent."
              : "Ticket-centric view of work flowing through the control plane. Lanes are keyed on the canonical TicketStatus enum."}
          </p>
          {paperclipConfigured ? (
            <p className="mt-2 font-mono text-xs text-muted/80">
              source: Paperclip API{projectId ? ` · project ${projectId}` : " · all projects"}
            </p>
          ) : configuredFile ? (
            <p className="mt-2 font-mono text-xs text-muted/80" title={configuredFile}>
              tickets file: {configuredFile}
            </p>
          ) : null}
        </div>
      </div>

      {paperclipConfigured ? (
        <InteractiveKanbanBoard projectId={projectId} />
      ) : (
        <StaticKanbanBody />
      )}
    </section>
  );
}

async function StaticKanbanBody() {
  const result = await listTicketsOrEmpty();
  return <KanbanBodyContent result={result} />;
}

function KanbanBodyContent({ result }: { result: ListTicketsResult }) {
  if (!result.ok && result.reason === "unconfigured") {
    return (
      <EmptyState
        title="No ticket source configured"
        description={`Set PAPERCLIP_API_KEY + PAPERCLIP_API_URL for interactive mode, or set ${TICKETS_FILE_ENV} to point at a JSON/JSONL file for read-only mode.`}
      />
    );
  }

  if (!result.ok) {
    return (
      <ErrorState
        title="Could not load tickets"
        description={
          result.message ?? "An unknown error occurred reading the configured tickets file."
        }
      />
    );
  }

  if (result.tickets.length === 0) {
    return (
      <EmptyState
        title="No tickets"
        description="The configured tickets file contains no records. Add a TicketRecord entry to see it appear on the board."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SummaryStrip tickets={result.tickets} />
      <KanbanBoard tickets={result.tickets} />
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

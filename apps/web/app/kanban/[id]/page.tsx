import Link from "next/link";

import type { TicketRecord } from "@control-plane/core";

import { TicketPriorityBadge, TicketStatusBadge } from "@/components/kanban/ticket-status-badge";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { formatRelative } from "@/lib/format";
import { loadTicketOrUndefined, TICKETS_FILE_ENV } from "@/lib/kanban-source";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { id } = await params;
  const decodedId = safeDecode(id);
  const result = await loadTicketOrUndefined(decodedId);

  if (!result.ok) {
    return (
      <section className="space-y-5">
        <Link href="/kanban" className="text-sm text-cyan hover:underline">
          ← Back to board
        </Link>
        {result.reason === "unconfigured" ? (
          <EmptyState
            title="No ticket source configured"
            description={`Set ${TICKETS_FILE_ENV} to point at a JSON or JSONL file containing canonical TicketRecord entries.`}
          />
        ) : result.reason === "not_found" ? (
          <EmptyState
            title="Ticket not found"
            description={`No ticket with id ${decodedId} was found in the configured tickets file.`}
          />
        ) : (
          <ErrorState
            title="Could not load ticket"
            description={
              result.message ?? "An unknown error occurred reading the configured tickets file."
            }
          />
        )}
      </section>
    );
  }

  const ticket: TicketRecord = result.ticket;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/kanban" className="text-cyan hover:underline">
          ← Back to board
        </Link>
        <span className="font-mono text-xs text-muted" title={ticket.id}>
          {ticket.id}
        </span>
      </div>

      <header className="glass-panel accent-gradient-subtle relative overflow-hidden rounded-lg p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Ticket</p>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-ink md:text-[28px]">
              {ticket.title}
            </h1>
            <p className="mt-2 break-all font-mono text-xs text-muted">{ticket.id}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Status" value={ticket.status} />
          <Stat label="Priority" value={ticket.priority} />
          <Stat label="Created" value={formatRelative(ticket.createdAt)} hint={ticket.createdAt} />
          <Stat label="Updated" value={formatRelative(ticket.updatedAt)} hint={ticket.updatedAt} />
          {ticket.assigneeAgentId ? (
            <StatLink
              label="Assigned agent"
              value={ticket.assigneeAgentId}
              href={`/agents/${encodeURIComponent(ticket.assigneeAgentId)}`}
              wide
            />
          ) : (
            <Stat label="Assigned agent" value="—" wide />
          )}
          {ticket.sessionId ? (
            <StatLink
              label="Linked session"
              value={ticket.sessionId}
              href={`/sessions/${encodeURIComponent(ticket.sessionId)}`}
              wide
            />
          ) : null}
          {ticket.externalUrl ? (
            <StatExternal
              label="External"
              value={ticket.externalUrl}
              href={ticket.externalUrl}
              wide
            />
          ) : null}
        </dl>
      </header>

      {ticket.description ? (
        <div>
          <div className="mb-3">
            <p className="eyebrow">Description</p>
            <h2 className="text-base font-semibold text-ink">Details</h2>
          </div>
          <div className="glass-panel whitespace-pre-wrap rounded-md p-5 text-sm leading-6 text-ink">
            {ticket.description}
          </div>
        </div>
      ) : null}

      <AuditEntries ticket={ticket} />
    </section>
  );
}

function AuditEntries({ ticket }: { readonly ticket: TicketRecord }) {
  // TicketRecord has no canonical audit array yet; surface any audit-like
  // entries parked on metadata so this view is faithful to the data we have,
  // and gracefully empty otherwise. No synthetic entries, ever.
  const metadata = ticket.metadata ?? null;
  const rawEntries =
    metadata && Array.isArray((metadata as Record<string, unknown>).audit)
      ? ((metadata as Record<string, unknown>).audit as readonly unknown[])
      : [];
  const entries = rawEntries.filter(isAuditEntry);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="eyebrow">Audit</p>
          <h2 className="text-base font-semibold text-ink">Trail</h2>
        </div>
        <p className="text-xs text-muted">
          Entries derived from ticket metadata. No synthetic history is shown.
        </p>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-line/70 bg-white/[0.02] p-6 text-center text-sm text-muted">
          No audit entries attached to this ticket.
        </div>
      ) : (
        <ul role="list" className="glass-panel divide-y divide-line/60 overflow-hidden rounded-md">
          {entries.map((entry) => (
            <li
              key={`${entry.at}-${entry.message.slice(0, 32)}`}
              className="flex items-start gap-4 px-4 py-3"
            >
              <div className="min-w-[140px] font-mono text-xs text-muted">{entry.at}</div>
              <div className="min-w-0">
                <p className="text-sm text-ink">{entry.message}</p>
                {entry.by ? (
                  <p className="mt-1 font-mono text-[11px] text-muted">by {entry.by}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface AuditEntry {
  readonly at: string;
  readonly message: string;
  readonly by?: string;
}

function isAuditEntry(value: unknown): value is AuditEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.at === "string" && typeof record.message === "string";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function Stat({
  label,
  value,
  hint,
  wide,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly wide?: boolean;
}) {
  return (
    <div className={`glass-panel-soft rounded-xs p-3 ${wide ? "col-span-2 md:col-span-4" : ""}`}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-sm text-ink">
        {value}
        {hint ? <span className="ml-2 font-mono text-xs text-muted/80">{hint}</span> : null}
      </dd>
    </div>
  );
}

function StatLink({
  label,
  value,
  href,
  wide,
}: {
  readonly label: string;
  readonly value: string;
  readonly href: string;
  readonly wide?: boolean;
}) {
  return (
    <div className={`glass-panel-soft rounded-xs p-3 ${wide ? "col-span-2 md:col-span-4" : ""}`}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-sm">
        <Link href={href} className="break-all font-mono text-xs text-cyan hover:underline">
          {value}
        </Link>
      </dd>
    </div>
  );
}

function StatExternal({
  label,
  value,
  href,
  wide,
}: {
  readonly label: string;
  readonly value: string;
  readonly href: string;
  readonly wide?: boolean;
}) {
  return (
    <div className={`glass-panel-soft rounded-xs p-3 ${wide ? "col-span-2 md:col-span-4" : ""}`}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-sm">
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all font-mono text-xs text-cyan hover:underline"
        >
          {value}
        </a>
      </dd>
    </div>
  );
}

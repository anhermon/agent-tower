"use client";

import { useCallback, useEffect, useState } from "react";

import { type TicketRecord, type TicketStatus } from "@control-plane/core";

import { Button } from "@/components/ui/button";
import { KANBAN_LANE_LABELS, KANBAN_LANE_ORDER, groupTicketsByStatus } from "@/lib/kanban-source";

import { CreateTicketModal } from "./create-ticket-modal";
import { TicketCard } from "./ticket-card";

interface InteractiveKanbanBoardProps {
  readonly projectId?: string;
}

interface TicketApiResponse {
  readonly ok: boolean;
  readonly tickets?: TicketRecord[];
  readonly message?: string;
}

export function InteractiveKanbanBoard({ projectId }: InteractiveKanbanBoardProps) {
  const [tickets, setTickets] = useState<readonly TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TicketStatus | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      const url = projectId
        ? `/api/kanban/tickets?projectId=${encodeURIComponent(projectId)}`
        : "/api/kanban/tickets";
      const res = await fetch(url);
      const data = (await res.json()) as TicketApiResponse;
      if (!data.ok) {
        setError(data.message ?? "Failed to load tickets");
        return;
      }
      setTickets(data.tickets ?? []);
      setError(null);
    } catch {
      setError("Network error loading tickets");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  async function handleDrop(targetStatus: TicketStatus) {
    if (!draggingId || draggingId === targetStatus) return;
    const ticket = tickets.find((t) => t.id === draggingId);
    if (!ticket || ticket.status === targetStatus) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }

    setMoving(draggingId);
    setDraggingId(null);
    setDropTarget(null);

    try {
      const res = await fetch(`/api/kanban/tickets/${encodeURIComponent(draggingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = (await res.json()) as { ok: boolean; ticket?: TicketRecord; message?: string };
      if (data.ok && data.ticket) {
        // Optimistically update the local state
        setTickets((prev) =>
          prev.map((t) => (t.id === draggingId && data.ticket ? data.ticket : t))
        );
      }
    } catch {
      /* silent — board will still show stale state; user can refresh */
    } finally {
      setMoving(null);
      // Refetch to sync with server
      void fetchTickets();
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-muted">Loading tickets…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  const grouped = groupTicketsByStatus(tickets);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{tickets.length} tickets</p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => void fetchTickets()}
            aria-label="Refresh board"
            className="px-2.5"
          >
            ↻ Refresh
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + New ticket
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {KANBAN_LANE_ORDER.map((status) => (
          <DroppableLane
            key={status}
            status={status}
            label={KANBAN_LANE_LABELS[status]}
            tickets={grouped[status]}
            isDropTarget={dropTarget === status}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(status);
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={() => void handleDrop(status)}
            onTicketDragStart={(id) => setDraggingId(id)}
            movingId={moving}
          />
        ))}
      </div>

      {/* Create modal */}
      {showCreate ? (
        <CreateTicketModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void fetchTickets();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DroppableLane
// ---------------------------------------------------------------------------

interface DroppableLaneProps {
  readonly status: TicketStatus;
  readonly label: string;
  readonly tickets: readonly TicketRecord[];
  readonly isDropTarget: boolean;
  readonly onDragOver: (e: React.DragEvent) => void;
  readonly onDragLeave: () => void;
  readonly onDrop: () => void;
  readonly onTicketDragStart: (id: string) => void;
  readonly movingId: string | null;
}

function DroppableLane({
  status,
  label,
  tickets,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onTicketDragStart,
  movingId,
}: DroppableLaneProps) {
  return (
    <section
      aria-labelledby={`lane-${status}-title`}
      className={[
        "flex min-w-[260px] flex-1 flex-col gap-3 rounded-md border p-3 transition-colors",
        isDropTarget ? "border-info/50 bg-info/5" : "border-line/60 bg-panel/70",
      ].join(" ")}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 id={`lane-${status}-title`} className="text-sm font-semibold text-ink">
          {label}
        </h2>
        <span className="font-mono text-xs text-muted/80">{tickets.length}</span>
      </header>

      {tickets.length === 0 && !isDropTarget ? (
        <div className="rounded-sm border border-dashed border-line/60 bg-white/[0.02] p-4 text-center text-xs text-muted">
          Drop a ticket here
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <li
              key={ticket.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                onTicketDragStart(ticket.id);
              }}
              className={movingId === ticket.id ? "opacity-40" : ""}
            >
              <TicketCard ticket={ticket} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

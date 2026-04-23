import type { TicketRecord } from "@control-plane/core";
import { LaneColumn } from "@/components/kanban/lane-column";
import { groupTicketsByStatus, KANBAN_LANE_LABELS, KANBAN_LANE_ORDER } from "@/lib/kanban-source";

type KanbanBoardProps = {
  readonly tickets: readonly TicketRecord[];
};

export function KanbanBoard({ tickets }: KanbanBoardProps) {
  const grouped = groupTicketsByStatus(tickets);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_LANE_ORDER.map((status) => (
        <LaneColumn
          key={status}
          status={status}
          label={KANBAN_LANE_LABELS[status]}
          tickets={grouped[status]}
        />
      ))}
    </div>
  );
}

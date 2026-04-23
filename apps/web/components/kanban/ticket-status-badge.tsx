import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@control-plane/core";

import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<TicketStatus, string> = {
  [TICKET_STATUSES.Open]: "Open",
  [TICKET_STATUSES.InProgress]: "In progress",
  [TICKET_STATUSES.Blocked]: "Blocked",
  [TICKET_STATUSES.Resolved]: "Resolved",
  [TICKET_STATUSES.Closed]: "Closed",
};

const STATUS_TONES: Record<TicketStatus, string> = {
  [TICKET_STATUSES.Open]: "text-info",
  [TICKET_STATUSES.InProgress]: "text-warn",
  [TICKET_STATUSES.Blocked]: "text-danger",
  [TICKET_STATUSES.Resolved]: "text-ok",
  [TICKET_STATUSES.Closed]: "text-muted",
};

export function TicketStatusBadge({
  status,
  className,
}: {
  readonly status: TicketStatus;
  readonly className?: string;
}) {
  return (
    <span className={cn("pill", STATUS_TONES[status], className)}>{STATUS_LABELS[status]}</span>
  );
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  [TICKET_PRIORITIES.Low]: "Low",
  [TICKET_PRIORITIES.Normal]: "Normal",
  [TICKET_PRIORITIES.High]: "High",
  [TICKET_PRIORITIES.Urgent]: "Urgent",
};

const PRIORITY_TONES: Record<TicketPriority, string> = {
  [TICKET_PRIORITIES.Low]: "text-muted",
  [TICKET_PRIORITIES.Normal]: "text-info",
  [TICKET_PRIORITIES.High]: "text-warn",
  [TICKET_PRIORITIES.Urgent]: "text-danger",
};

export function TicketPriorityBadge({
  priority,
  className,
}: {
  readonly priority: TicketPriority;
  readonly className?: string;
}) {
  return (
    <span className={cn("pill", PRIORITY_TONES[priority], className)}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

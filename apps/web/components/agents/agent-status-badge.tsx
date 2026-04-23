import { AGENT_STATUSES, type AgentStatus } from "@control-plane/core";
import { cn } from "@/lib/utils";

type AgentStatusBadgeProps = {
  status: AgentStatus;
  className?: string;
};

const LABELS: Record<AgentStatus, string> = {
  [AGENT_STATUSES.Available]: "Available",
  [AGENT_STATUSES.Busy]: "Busy",
  [AGENT_STATUSES.Offline]: "Offline",
  [AGENT_STATUSES.Error]: "Error"
};

const TONES: Record<AgentStatus, string> = {
  [AGENT_STATUSES.Available]: "text-ok",
  [AGENT_STATUSES.Busy]: "text-warn",
  [AGENT_STATUSES.Offline]: "text-muted",
  [AGENT_STATUSES.Error]: "text-danger"
};

export function AgentStatusBadge({ status, className }: AgentStatusBadgeProps) {
  return <span className={cn("pill", TONES[status], className)}>{LABELS[status]}</span>;
}

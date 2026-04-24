"use client";

import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ObservedWebhookEvent } from "../types";

interface RecentActivityListProps {
  readonly events: readonly ObservedWebhookEvent[];
  readonly onSelectEvent: (eventId: string) => void;
}

const STATUS_DOT_COLORS: Record<ObservedWebhookEvent["status"], string> = {
  triggered: "bg-blue-500",
  queued: "bg-amber-500",
  processing: "bg-purple-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  dlq: "bg-red-900",
};

export function RecentActivityList({ events, onSelectEvent }: RecentActivityListProps) {
  const recent = events.slice(0, 10);

  return (
    <div className="glass-panel rounded-lg p-4">
      <p className="eyebrow">Recent Activity</p>
      <div className="mt-3 space-y-1">
        {recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No recent activity</p>
        ) : (
          recent.map((event) => {
            const isFailed = event.status === "failed" || event.status === "dlq";
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectEvent(event.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xs px-2 py-2 text-left transition-colors hover:bg-white/[0.02]",
                  isFailed && "border-l-2 border-l-red-500 bg-red-500/5"
                )}
              >
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT_COLORS[event.status])}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm", isFailed ? "text-danger" : "text-ink")}>
                    {event.eventLabel}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {event.providerLabel} · {event.repository}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {formatRelative(event.receivedAt)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

"use client";

import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ObservedWebhookEvent, WebhookEventCategory } from "../types";

interface EventTypePanelProps {
  readonly category: WebhookEventCategory;
  readonly label: string;
  readonly events: readonly ObservedWebhookEvent[];
  readonly isExpanded: boolean;
  readonly onToggleExpand: () => void;
  readonly onSelectEvent: (eventId: string) => void;
}

const STATUS_TONES: Record<ObservedWebhookEvent["status"], string> = {
  triggered: "text-info",
  queued: "text-warn",
  processing: "text-[#8f7cff]",
  completed: "text-ok",
  failed: "text-danger",
  dlq: "text-[#7f1d1d]",
};

const STATUS_LABELS: Record<ObservedWebhookEvent["status"], string> = {
  triggered: "Triggered",
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  dlq: "DLQ",
};

export function EventTypePanel({
  category,
  label,
  events,
  isExpanded,
  onToggleExpand,
  onSelectEvent,
}: EventTypePanelProps) {
  const previewEvents = events.slice(0, 5);
  const hasMore = events.length > 5;

  return (
    <article
      className={cn(
        "glass-panel rounded-lg overflow-hidden flex flex-col",
        isExpanded && "col-span-2 row-span-2"
      )}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <span className="pill text-muted">{events.length}</span>
        </div>
        <span
          className={cn("text-xs text-muted transition-transform", isExpanded && "rotate-180")}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      <div className="flex-1 px-4 pb-4">
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No events</p>
        ) : isExpanded ? (
          <div className="mt-2 overflow-hidden rounded-xs border border-line/80">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Event</th>
                  <th className="px-3 py-2 text-left font-semibold">Repository</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30">
                {events.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => onSelectEvent(event.id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-white/[0.02]",
                      (event.status === "failed" || event.status === "dlq") &&
                        "border-l-2 border-l-red-500"
                    )}
                  >
                    <td className="px-3 py-2 text-ink">{event.eventLabel}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{event.repository}</td>
                    <td className="px-3 py-2">
                      <span className={cn("pill text-[11px]", STATUS_TONES[event.status])}>
                        {STATUS_LABELS[event.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted">
                      {formatRelative(event.receivedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {previewEvents.map((event) => (
              <li
                key={event.id}
                onClick={() => onSelectEvent(event.id)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-xs px-2.5 py-2 transition-colors hover:bg-white/[0.02]",
                  (event.status === "failed" || event.status === "dlq") &&
                    "border-l-2 border-l-red-500"
                )}
              >
                <span className="truncate text-sm text-ink">{event.eventLabel}</span>
                <span className={cn("pill shrink-0 text-[11px]", STATUS_TONES[event.status])}>
                  {STATUS_LABELS[event.status]}
                </span>
              </li>
            ))}
            {hasMore && (
              <li className="px-2.5 py-1 text-xs text-muted">+{events.length - 5} more</li>
            )}
          </ul>
        )}
      </div>
    </article>
  );
}

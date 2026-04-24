"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import type {
  ObservedWebhookEvent,
  WebhookEventFilters,
  WebhookEventStatus,
  WebhookProviderId,
} from "../types";

/* ------------------------------------------------------------------ */
/*  StatusBadge                                                        */
/* ------------------------------------------------------------------ */

interface StatusBadgeProps {
  readonly status: WebhookEventStatus;
  readonly size?: "sm" | "md" | "lg";
}

const STATUS_STYLES: Record<WebhookEventStatus, { text: string; bg: string; label: string }> = {
  triggered: { text: "text-blue-500", bg: "bg-blue-500/10", label: "Triggered" },
  queued: { text: "text-amber-500", bg: "bg-amber-500/10", label: "Queued" },
  processing: { text: "text-purple-500", bg: "bg-purple-500/10", label: "Processing" },
  completed: { text: "text-green-500", bg: "bg-green-500/10", label: "Completed" },
  failed: { text: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
  dlq: { text: "text-red-900", bg: "bg-red-900/10", label: "DLQ" },
};

const SIZE_STYLES = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        style.text,
        style.bg,
        SIZE_STYLES[size]
      )}
    >
      <span
        className={cn("block rounded-full", size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5")}
        style={{ backgroundColor: "currentColor" }}
      />
      {style.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  TimeRangeWidget                                                    */
/* ------------------------------------------------------------------ */

interface TimeRangeWidgetProps {
  readonly filters: WebhookEventFilters;
  readonly onFiltersChange: (filters: WebhookEventFilters) => void;
}

const QUICK_PICKS = [
  { label: "Last 1h", hours: 1 },
  { label: "Last 24h", hours: 24 },
  { label: "Last 7d", hours: 168 },
] as const;

function TimeRangeWidget({ filters, onFiltersChange }: TimeRangeWidgetProps) {
  const [showCustom, setShowCustom] = useState(false);

  const activeQuickPick = useMemo(() => {
    if (filters.timeFrom && !filters.timeTo) {
      const fromMs = new Date(filters.timeFrom).getTime();
      const toMs = Date.now();
      const hours = (toMs - fromMs) / (1000 * 60 * 60);
      return QUICK_PICKS.find((p) => Math.abs(p.hours - hours) < 0.1)?.label ?? null;
    }
    return null;
  }, [filters.timeFrom, filters.timeTo]);

  function applyQuickPick(hours: number) {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    onFiltersChange({ ...filters, timeFrom: from, timeTo: to });
    setShowCustom(false);
  }

  function clearTimeRange() {
    onFiltersChange({ ...filters, timeFrom: undefined, timeTo: undefined });
    setShowCustom(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {QUICK_PICKS.map((pick) => (
        <button
          key={pick.label}
          type="button"
          className={cn("control-chip text-xs", activeQuickPick === pick.label && "is-active")}
          onClick={() => applyQuickPick(pick.hours)}
        >
          {pick.label}
        </button>
      ))}

      <button
        type="button"
        className={cn("control-chip text-xs", showCustom && "is-active")}
        onClick={() => setShowCustom((s) => !s)}
      >
        Custom range…
      </button>

      {(filters.timeFrom || filters.timeTo) && (
        <button
          type="button"
          className="text-xs text-muted hover:text-ink"
          onClick={clearTimeRange}
        >
          Clear
        </button>
      )}

      {showCustom && (
        <div className="flex w-full items-center gap-2 pt-1">
          <input
            type="datetime-local"
            className="h-9 rounded-xs border border-line/80 bg-panel px-2 text-xs text-ink outline-none focus:border-info"
            value={filters.timeFrom ? filters.timeFrom.slice(0, 16) : ""}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                timeFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              })
            }
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="datetime-local"
            className="h-9 rounded-xs border border-line/80 bg-panel px-2 text-xs text-ink outline-none focus:border-info"
            value={filters.timeTo ? filters.timeTo.slice(0, 16) : ""}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                timeTo: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              })
            }
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  EventStreamTable                                                   */
/* ------------------------------------------------------------------ */

export type EventStreamTableColumn = "event" | "provider" | "repository" | "status" | "time";

interface EventStreamTableProps {
  readonly events: readonly ObservedWebhookEvent[];
  readonly columns: EventStreamTableColumn[];
  readonly filters: WebhookEventFilters;
  readonly onFiltersChange: (filters: WebhookEventFilters) => void;
  readonly onSelectEvent: (eventId: string) => void;
  readonly selectedEventId: string | null;
  readonly totalCount: number;
  readonly onLoadMore: () => void;
  readonly hasMore: boolean;
  readonly isLoading?: boolean;
}

type SortDirection = "asc" | "desc";

export function EventStreamTable({
  events,
  columns,
  filters,
  onFiltersChange,
  onSelectEvent,
  selectedEventId,
  totalCount,
  onLoadMore,
  hasMore,
  isLoading = false,
}: EventStreamTableProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [openFilterColumn, setOpenFilterColumn] = useState<EventStreamTableColumn | null>(null);
  const dropdownRef = useRef<HTMLTableCellElement>(null);

  /* ---- close dropdown on outside click ---- */
  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenFilterColumn(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ---- sorted events ---- */
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aTime = new Date(a.receivedAt).getTime();
      const bTime = new Date(b.receivedAt).getTime();
      return sortDirection === "desc" ? bTime - aTime : aTime - bTime;
    });
  }, [events, sortDirection]);

  /* ---- filter options derived from data ---- */
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};

    if (columns.includes("event")) {
      opts.event = [...new Set(events.map((e) => e.eventLabel))].sort();
    }
    if (columns.includes("provider")) {
      opts.provider = [...new Set(events.map((e) => e.providerLabel))].sort();
    }
    if (columns.includes("repository")) {
      opts.repository = [...new Set(events.map((e) => e.repository))].sort();
    }
    if (columns.includes("status")) {
      opts.status = [...new Set(events.map((e) => e.status))].sort();
    }

    return opts;
  }, [events, columns]);

  /* ---- helpers ---- */
  const isFailedOrDlq = useCallback(
    (status: WebhookEventStatus) => status === "failed" || status === "dlq",
    []
  );

  function toggleSort() {
    setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
  }

  function clearAllFilters() {
    onFiltersChange({
      providerId: "all",
      status: "all",
      repo: "all",
      query: "",
      timeFrom: undefined,
      timeTo: undefined,
    });
  }

  function formatTimeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  /* ---- filter dropdown helpers ---- */
  function getFilterValue(column: EventStreamTableColumn): string {
    switch (column) {
      case "provider":
        return filters.providerId === "all"
          ? "all"
          : (events.find((e) => e.providerId === filters.providerId)?.providerLabel ?? "all");
      case "status":
        return filters.status;
      case "repository":
        return filters.repo;
      case "event":
        return filters.query || "all";
      default:
        return "all";
    }
  }

  function setFilterValue(column: EventStreamTableColumn, value: string) {
    switch (column) {
      case "provider": {
        const providerId =
          value === "all"
            ? "all"
            : (events.find((e) => e.providerLabel === value)?.providerId ?? "all");
        onFiltersChange({ ...filters, providerId: providerId });
        break;
      }
      case "status":
        onFiltersChange({ ...filters, status: value as WebhookEventStatus | "all" });
        break;
      case "repository":
        onFiltersChange({ ...filters, repo: value });
        break;
      case "event":
        onFiltersChange({ ...filters, query: value === "all" ? "" : value });
        break;
    }
    setOpenFilterColumn(null);
  }

  function isFilterActive(column: EventStreamTableColumn): boolean {
    switch (column) {
      case "provider":
        return filters.providerId !== "all";
      case "status":
        return filters.status !== "all";
      case "repository":
        return filters.repo !== "all";
      case "event":
        return filters.query !== "";
      default:
        return false;
    }
  }

  /* ---- empty state helpers ---- */
  const hasAnyEvents = totalCount > 0;
  const hasVisibleEvents = sortedEvents.length > 0;
  const anyFilterActive =
    filters.providerId !== "all" ||
    filters.status !== "all" ||
    filters.repo !== "all" ||
    filters.query !== "" ||
    filters.timeFrom !== undefined ||
    filters.timeTo !== undefined;

  /* ---- column header renderer ---- */
  function renderHeader(column: EventStreamTableColumn) {
    if (column === "time") {
      return (
        <th className="px-4 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 font-semibold text-muted hover:text-ink"
            onClick={toggleSort}
          >
            <span className="eyebrow">Time</span>
            <span className="text-xs">{sortDirection === "desc" ? "▼" : "▲"}</span>
          </button>
        </th>
      );
    }

    const label =
      column === "event"
        ? "Event"
        : column === "provider"
          ? "Provider"
          : column === "repository"
            ? "Repository"
            : "Status";

    const active = isFilterActive(column);
    const options = filterOptions[column] ?? [];

    return (
      <th
        className="relative px-4 py-3"
        ref={openFilterColumn === column ? dropdownRef : undefined}
      >
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 transition-colors",
            active ? "text-cyan" : "text-muted hover:text-ink"
          )}
          onClick={() => setOpenFilterColumn(openFilterColumn === column ? null : column)}
        >
          <span className="eyebrow">{label}</span>
          <Icon
            name="chevron"
            className={cn(
              "h-3 w-3 transition-transform",
              openFilterColumn === column && "rotate-180"
            )}
          />
          {active && (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyan/20 text-[10px] font-bold text-cyan">
              ✓
            </span>
          )}
        </button>

        {openFilterColumn === column && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-line/80 bg-panel p-2 shadow-glass">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-xs transition-colors",
                getFilterValue(column) === "all" ? "bg-cyan/10 text-cyan" : "text-ink hover:bg-soft"
              )}
              onClick={() => setFilterValue(column, "all")}
            >
              <span
                className={cn(
                  "h-3.5 w-3.5 rounded-sm border",
                  getFilterValue(column) === "all" ? "border-cyan bg-cyan" : "border-line"
                )}
              >
                {getFilterValue(column) === "all" && (
                  <svg className="h-3.5 w-3.5 text-[rgb(7_11_20)]" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 8l2.5 2.5L12 5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              All {label.toLowerCase()}s
            </button>

            {options.map((option) => {
              const selected = getFilterValue(column) === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-xs transition-colors",
                    selected ? "bg-cyan/10 text-cyan" : "text-ink hover:bg-soft"
                  )}
                  onClick={() => setFilterValue(column, option)}
                >
                  <span
                    className={cn(
                      "h-3.5 w-3.5 rounded-sm border",
                      selected ? "border-cyan bg-cyan" : "border-line"
                    )}
                  >
                    {selected && (
                      <svg
                        className="h-3.5 w-3.5 text-[rgb(7_11_20)]"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M4 8l2.5 2.5L12 5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  {column === "status" ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          STATUS_STYLES[option as WebhookEventStatus].text
                        )}
                      />
                      {STATUS_STYLES[option as WebhookEventStatus].label}
                    </span>
                  ) : (
                    option
                  )}
                </button>
              );
            })}
          </div>
        )}
      </th>
    );
  }

  /* ---- cell renderer ---- */
  function renderCell(event: ObservedWebhookEvent, column: EventStreamTableColumn) {
    switch (column) {
      case "event":
        return (
          <td className="px-4 py-3">
            <div className="text-sm font-medium text-ink">{event.eventLabel}</div>
            <div className="mt-0.5 text-xs text-muted">{event.action}</div>
          </td>
        );
      case "provider":
        return <td className="px-4 py-3 text-sm text-ink">{event.providerLabel}</td>;
      case "repository":
        return <td className="px-4 py-3 text-sm text-ink">{event.repository}</td>;
      case "status":
        return (
          <td className="px-4 py-3">
            <StatusBadge status={event.status} />
          </td>
        );
      case "time":
        return <td className="px-4 py-3 text-sm text-muted">{formatTimeAgo(event.receivedAt)}</td>;
    }
  }

  return (
    <div className="space-y-4">
      {/* Time Range Widget */}
      <TimeRangeWidget filters={filters} onFiltersChange={onFiltersChange} />

      {/* Table */}
      <div className="glass-panel overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-left">
            <thead className="border-b border-line/60 bg-soft/50">
              <tr>
                {columns.map((col) => (
                  <React.Fragment key={col}>{renderHeader(col)}</React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-line/40">
              {isLoading ? (
                /* ---- skeleton rows ---- */
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-3">
                        <div className="animate-pulse rounded bg-muted/20">
                          <div
                            className={cn(
                              "h-4",
                              col === "time" ? "w-16" : col === "status" ? "w-20" : "w-32"
                            )}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : !hasAnyEvents ? (
                /* ---- completely empty ---- */
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <Icon name="bell" className="h-8 w-8 text-muted/40" />
                      <p className="mt-3 text-sm font-medium text-muted">
                        Events will appear here when webhooks are received
                      </p>
                    </div>
                  </td>
                </tr>
              ) : !hasVisibleEvents ? (
                /* ---- filtered to zero ---- */
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <Icon name="search" className="h-8 w-8 text-muted/40" />
                      <p className="mt-3 text-sm font-medium text-muted">
                        No events match your filters
                      </p>
                      {anyFilterActive && (
                        <Button variant="secondary" className="mt-3" onClick={clearAllFilters}>
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                /* ---- data rows ---- */
                sortedEvents.map((event) => {
                  const failed = isFailedOrDlq(event.status);
                  const selected = event.id === selectedEventId;

                  return (
                    <tr
                      key={event.id}
                      className={cn(
                        "cursor-pointer transition-colors",
                        failed && "border-l-2 border-l-red-500 bg-red-500/5",
                        selected && "bg-cyan/5",
                        !failed && !selected && "hover:bg-soft/50"
                      )}
                      onClick={() => onSelectEvent(event.id)}
                    >
                      {columns.map((col) => (
                        <React.Fragment key={col}>{renderCell(event, col)}</React.Fragment>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!isLoading && hasVisibleEvents && (
          <div className="flex items-center justify-between border-t border-line/40 px-4 py-3">
            <p className="text-xs text-muted">
              Showing {sortedEvents.length} of {totalCount} events
            </p>
            {hasMore && (
              <Button variant="secondary" onClick={onLoadMore}>
                Load more
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

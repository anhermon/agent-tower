"use client";

import { useMemo, useState, useCallback } from "react";

import { computeStats, getProviderBreakdown } from "../state";

import { EventStreamTable } from "./event-stream-table";
import { ProviderBreakdown } from "./provider-breakdown";
import { RecentActivityList } from "./recent-activity-list";
import { StatsRow } from "./stats-row";

import type { ObservedWebhookEvent, WebhookEventFilters } from "../types";

interface OverviewDashboardProps {
  readonly events: readonly ObservedWebhookEvent[];
  readonly onSelectEvent: (eventId: string) => void;
  readonly filters: WebhookEventFilters;
  readonly onFiltersChange: (filters: WebhookEventFilters) => void;
}

export function OverviewDashboard({
  events,
  onSelectEvent,
  filters,
  onFiltersChange,
}: OverviewDashboardProps) {
  const stats = useMemo(() => computeStats(events), [events]);
  const breakdown = useMemo(() => getProviderBreakdown(events), [events]);

  const [displayCount, setDisplayCount] = useState(50);
  const displayedEvents = events.slice(0, displayCount);
  const hasMore = events.length > displayCount;

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + 50);
  }, []);

  return (
    <div className="space-y-5">
      <StatsRow
        stats={{
          ...stats,
          total24hTrend: 0, // Phase 1: no historical comparison
        }}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <ProviderBreakdown breakdown={breakdown} />
        <RecentActivityList events={events} onSelectEvent={onSelectEvent} />
      </div>

      <div className="space-y-3">
        <EventStreamTable
          events={displayedEvents}
          columns={["event", "provider", "repository", "status", "time"]}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSelectEvent={onSelectEvent}
          selectedEventId={null}
          totalCount={events.length}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
        />
      </div>
    </div>
  );
}

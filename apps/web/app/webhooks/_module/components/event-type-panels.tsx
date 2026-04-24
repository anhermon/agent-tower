"use client";

import { useState, useCallback } from "react";

import { groupEventsByCategory } from "../state";

import { EventTypePanel } from "./event-type-panel";

import type { ObservedWebhookEvent, WebhookEventCategory } from "../types";

interface EventTypePanelsProps {
  readonly events: readonly ObservedWebhookEvent[];
  readonly onSelectEvent: (eventId: string) => void;
}

const CATEGORY_LABELS: Record<WebhookEventCategory, string> = {
  pull_requests: "Pull Requests",
  issues: "Issues",
  ci: "CI / Workflows",
  other: "Other",
};

const CATEGORY_ORDER: WebhookEventCategory[] = ["pull_requests", "issues", "ci", "other"];

export function EventTypePanels({ events, onSelectEvent }: EventTypePanelsProps) {
  const [expandedCategory, setExpandedCategory] = useState<WebhookEventCategory | null>(null);
  const grouped = groupEventsByCategory(events);

  const handleToggleExpand = useCallback((category: WebhookEventCategory) => {
    setExpandedCategory((prev) => (prev === category ? null : category));
  }, []);

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {CATEGORY_ORDER.map((category) => (
        <EventTypePanel
          key={category}
          label={CATEGORY_LABELS[category]}
          events={grouped[category]}
          isExpanded={expandedCategory === category}
          onToggleExpand={() => handleToggleExpand(category)}
          onSelectEvent={onSelectEvent}
        />
      ))}
    </section>
  );
}

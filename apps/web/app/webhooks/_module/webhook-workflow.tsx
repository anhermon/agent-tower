"use client";

import { useCallback, useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import { EventDetailPanel } from "./components/event-detail-panel";
import { EventStreamTable } from "./components/event-stream-table";
import { EventTypePanels } from "./components/event-type-panels";
import { IntegrationHeader } from "./components/integration-header";
import { OverviewDashboard } from "./components/overview-dashboard";
import { RepoFilterBar } from "./components/repo-filter-bar";
import { WebhookSidebar } from "./components/webhook-sidebar";
import {
  createDefaultWebhookDraft,
  createObservedWebhookEvent,
  filterObservedWebhookEvents,
  getWebhookProvider,
  registerWebhookIntegration,
  validateWebhookDraft,
} from "./state";

import type {
  ObservedWebhookEvent,
  RegisteredWebhookIntegration,
  WebhookEventFilters,
  WebhookProviderId,
} from "./types";

interface WebhookWorkflowProps {
  readonly initialSubscriptions?: RegisteredWebhookIntegration[];
}

const INITIAL_FILTERS: WebhookEventFilters = {
  providerId: "all",
  status: "all",
  repo: "all",
  query: "",
};

export function WebhookWorkflow({ initialSubscriptions = [] }: WebhookWorkflowProps) {
  const [integrations, setIntegrations] =
    useState<RegisteredWebhookIntegration[]>(initialSubscriptions);
  const [observedEvents, setObservedEvents] = useState<ObservedWebhookEvent[]>([]);
  const [selectedView, setSelectedView] = useState<"overview" | WebhookProviderId | "dlq" | "add">(
    "overview"
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [filters, setFilters] = useState<WebhookEventFilters>(INITIAL_FILTERS);
  const [activeRepoIds, setActiveRepoIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ---- derived state ---- */
  const selectedEvent = useMemo(
    () => observedEvents.find((e) => e.id === selectedEventId) ?? null,
    [observedEvents, selectedEventId]
  );

  const selectedIntegration = useMemo(() => {
    if (selectedView === "overview" || selectedView === "dlq" || selectedView === "add")
      return null;
    return integrations.find((i) => i.providerId === selectedView) ?? null;
  }, [integrations, selectedView]);

  const selectedProvider = useMemo(() => {
    if (selectedView === "overview" || selectedView === "dlq" || selectedView === "add")
      return null;
    return getWebhookProvider(selectedView);
  }, [selectedView]);

  const integrationEvents = useMemo(() => {
    if (!selectedIntegration) return [];
    return observedEvents.filter((e) => e.integrationId === selectedIntegration.id);
  }, [observedEvents, selectedIntegration]);

  const filteredIntegrationEvents = useMemo(() => {
    let events = integrationEvents;
    if (activeRepoIds.length > 0) {
      events = events.filter((e) => activeRepoIds.includes(e.repository));
    }
    return filterObservedWebhookEvents(events, {
      ...filters,
      providerId: "all", // already scoped to integration
    });
  }, [integrationEvents, activeRepoIds, filters]);

  const repos = useMemo(() => {
    const seen = new Set<string>();
    for (const event of integrationEvents) {
      seen.add(event.repository);
    }
    return Array.from(seen);
  }, [integrationEvents]);

  const dlqEvents = useMemo(
    () => observedEvents.filter((e) => e.status === "dlq"),
    [observedEvents]
  );

  /* ---- callbacks ---- */
  const handleSelectView = useCallback((view: "overview" | WebhookProviderId | "dlq" | "add") => {
    setSelectedView(view);
    setSidebarOpen(false);
    setSelectedEventId(null);
  }, []);

  const handleSelectEvent = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
  }, []);

  const handleCloseEventDetail = useCallback(() => {
    setSelectedEventId(null);
  }, []);

  const handleToggleRepo = useCallback((repo: string) => {
    setActiveRepoIds((prev) =>
      prev.includes(repo) ? prev.filter((r) => r !== repo) : [...prev, repo]
    );
  }, []);

  const handleAddRepo = useCallback((repo: string) => {
    setActiveRepoIds((prev) => (prev.includes(repo) ? prev : [...prev, repo]));
  }, []);

  const handleTestWebhook = useCallback(() => {
    if (!selectedIntegration) return;
    const eventId = selectedIntegration.selectedEventIds[0];
    if (!eventId) return;
    const event = createObservedWebhookEvent({
      integration: selectedIntegration,
      eventId,
      sequence: observedEvents.length + 1,
      now: new Date(),
    });
    setObservedEvents((prev) => [event, ...prev]);
  }, [selectedIntegration, observedEvents]);

  const handleRegisterIntegration = useCallback(() => {
    // Simple demo: create a default GitHub integration
    const draft = createDefaultWebhookDraft("github");
    const validation = validateWebhookDraft(draft);
    if (!validation.ok) return;
    const integration = registerWebhookIntegration({
      draft,
      sequence: integrations.length + 1,
      now: new Date(),
    });
    setIntegrations((prev) => [integration, ...prev]);
    setSelectedView(integration.providerId);
  }, [integrations]);

  /* ---- view rendering ---- */
  function renderMainContent() {
    if (selectedView === "overview") {
      return (
        <OverviewDashboard
          events={observedEvents}
          onSelectEvent={handleSelectEvent}
          filters={filters}
          onFiltersChange={setFilters}
        />
      );
    }

    if (selectedView === "dlq") {
      return (
        <div className="space-y-5">
          <header className="glass-panel rounded-lg p-5">
            <h2 className="text-lg font-semibold text-ink">Dead Letter Queue</h2>
            <p className="mt-1 text-sm text-muted">
              {dlqEvents.length} events requiring manual intervention
            </p>
          </header>
          <EventStreamTable
            events={dlqEvents}
            columns={["event", "provider", "repository", "status", "time"]}
            filters={filters}
            onFiltersChange={setFilters}
            onSelectEvent={handleSelectEvent}
            selectedEventId={selectedEventId}
            totalCount={dlqEvents.length}
            onLoadMore={() => {}}
            hasMore={false}
          />
        </div>
      );
    }

    if (selectedView === "add") {
      return (
        <div className="glass-panel rounded-lg p-8 text-center">
          <Icon name="plus" className="mx-auto h-10 w-10 text-muted" />
          <h2 className="mt-4 text-lg font-semibold text-ink">Add Integration</h2>
          <p className="mt-2 text-sm text-muted">
            Register a new webhook integration to start receiving events.
          </p>
          <button
            type="button"
            onClick={handleRegisterIntegration}
            className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-xs border border-transparent accent-gradient px-6 text-sm font-semibold text-[rgb(7_11_20)] shadow-glow"
          >
            Register GitHub Integration
          </button>
        </div>
      );
    }

    // Integration detail view
    if (!selectedProvider) return null;

    return (
      <div className="space-y-5">
        <IntegrationHeader
          provider={selectedProvider}
          integration={selectedIntegration}
          events={integrationEvents}
          onConfigure={() => {}}
          onTestWebhook={handleTestWebhook}
        />

        <div className="glass-panel rounded-lg p-4">
          <p className="eyebrow">Repositories</p>
          <div className="mt-2">
            <RepoFilterBar
              repos={repos}
              activeRepoIds={activeRepoIds}
              onToggleRepo={handleToggleRepo}
              onAddRepo={handleAddRepo}
            />
          </div>
        </div>

        <EventTypePanels events={filteredIntegrationEvents} onSelectEvent={handleSelectEvent} />

        <div className="space-y-3">
          <p className="eyebrow">All Events</p>
          <EventStreamTable
            events={filteredIntegrationEvents}
            columns={["event", "repository", "status", "time"]}
            filters={filters}
            onFiltersChange={setFilters}
            onSelectEvent={handleSelectEvent}
            selectedEventId={selectedEventId}
            totalCount={integrationEvents.length}
            onLoadMore={() => {}}
            hasMore={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <WebhookSidebar
        selectedView={selectedView}
        integrations={integrations}
        dlqCount={dlqEvents.length}
        onSelectView={handleSelectView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {/* Mobile sidebar toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="mb-4 inline-flex items-center gap-2 rounded-xs border border-line/80 bg-ink/[0.04] px-3 py-2 text-sm text-ink lg:hidden"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
          Menu
        </button>

        {renderMainContent()}
      </main>

      <EventDetailPanel
        event={selectedEvent}
        isOpen={selectedEventId !== null}
        onClose={handleCloseEventDetail}
      />
    </div>
  );
}

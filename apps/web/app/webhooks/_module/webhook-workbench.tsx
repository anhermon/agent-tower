"use client";

import { useCallback, type ChangeEvent, type ReactNode, useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import { WEBHOOK_PROVIDER_CATALOG, WEBHOOK_ROUTE_MODES } from "./catalog";
import {
  countEnabledEvents,
  createDefaultWebhookDraft,
  createObservedWebhookEvent,
  filterObservedWebhookEvents,
  getWebhookEventDefinition,
  getWebhookProvider,
  registerWebhookIntegration,
  routeModeLabel,
  switchWebhookDraftProvider,
  toggleWebhookDraftEvent,
  validateWebhookDraft,
} from "./state";

import type {
  ObservedWebhookEvent,
  RegisteredWebhookIntegration,
  WebhookEventFilters,
  WebhookEventStatus,
  WebhookIntegrationDraft,
  WebhookObservedStatus,
} from "./types";

interface WebhookWorkbenchProps {
  readonly variant?: "embedded" | "standalone";
}

const INITIAL_FILTERS: WebhookEventFilters = {
  providerId: "all",
  status: "all",
  query: "",
};

const EVENT_FILTER_STATUSES: readonly (WebhookObservedStatus | "all")[] = [
  "all",
  "accepted",
  "routed",
  "failed",
] as const;

export function WebhookWorkbench({ variant = "embedded" }: WebhookWorkbenchProps) {
  const [draft, setDraft] = useState<WebhookIntegrationDraft>(() => createDefaultWebhookDraft());
  const [integrations, setIntegrations] = useState<RegisteredWebhookIntegration[]>([]);
  const [observedEvents, setObservedEvents] = useState<ObservedWebhookEvent[]>([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [filters, setFilters] = useState<WebhookEventFilters>(INITIAL_FILTERS);
  const [clipboardState, setClipboardState] = useState<"idle" | "copied" | "failed">("idle");

  const provider = getWebhookProvider(draft.providerId);
  const validation = validateWebhookDraft(draft);
  const selectedIntegration =
    integrations.find((integration) => integration.id === selectedIntegrationId) ??
    integrations[0] ??
    null;
  const triggerEventId = selectedEventId ?? selectedIntegration?.selectedEventIds[0] ?? null;
  const filteredEvents = useMemo(
    () => filterObservedWebhookEvents(observedEvents, filters),
    [observedEvents, filters]
  );
  const selectedObservedEvent = filteredEvents[0] ?? observedEvents[0] ?? null;

  const updateDraft = useCallback((patch: Partial<WebhookIntegrationDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const registerIntegration = useCallback(() => {
    if (!validation.ok) return;
    const integration = registerWebhookIntegration({
      draft,
      sequence: integrations.length + 1,
      now: new Date(),
    });
    setIntegrations((current) => [integration, ...current]);
    setSelectedIntegrationId(integration.id);
    setSelectedEventId(integration.selectedEventIds[0] ?? null);
  }, [draft, integrations.length, validation.ok]);

  const triggerTestEvent = useCallback(() => {
    if (!selectedIntegration || !triggerEventId) return;
    const event = createObservedWebhookEvent({
      integration: selectedIntegration,
      eventId: triggerEventId,
      sequence: observedEvents.length + 1,
      now: new Date(),
    });
    setObservedEvents((current) => [event, ...current]);
  }, [selectedIntegration, triggerEventId, observedEvents.length]);

  const copyEndpointPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(provider.endpointPath);
      setClipboardState("copied");
    } catch {
      setClipboardState("failed");
    }
  }, [provider.endpointPath]);

  const handleSelectIntegration = useCallback((integration: RegisteredWebhookIntegration) => {
    setSelectedIntegrationId(integration.id);
    setSelectedEventId(integration.selectedEventIds[0] ?? null);
  }, []);

  return (
    <WorkbenchShell
      variant={variant}
      draft={draft}
      setDraft={setDraft}
      integrations={integrations}
      observedEvents={observedEvents}
      selectedIntegration={selectedIntegration}
      _selectedEventId={selectedEventId}
      setSelectedEventId={setSelectedEventId}
      triggerEventId={triggerEventId}
      filteredEvents={filteredEvents}
      selectedObservedEvent={selectedObservedEvent}
      filters={filters}
      setFilters={setFilters}
      clipboardState={clipboardState}
      provider={provider}
      validation={validation}
      updateDraft={updateDraft}
      registerIntegration={registerIntegration}
      triggerTestEvent={triggerTestEvent}
      copyEndpointPath={copyEndpointPath}
      handleSelectIntegration={handleSelectIntegration}
    />
  );
}

function WorkbenchShell({
  variant,
  draft,
  setDraft,
  integrations,
  observedEvents,
  selectedIntegration,
  _selectedEventId,
  setSelectedEventId,
  triggerEventId,
  filteredEvents,
  selectedObservedEvent,
  filters,
  setFilters,
  clipboardState,
  provider,
  validation,
  updateDraft,
  registerIntegration,
  triggerTestEvent,
  copyEndpointPath,
  handleSelectIntegration,
}: {
  readonly variant: "embedded" | "standalone";
  readonly draft: WebhookIntegrationDraft;
  readonly setDraft: (draft: WebhookIntegrationDraft) => void;
  readonly integrations: RegisteredWebhookIntegration[];
  readonly observedEvents: ObservedWebhookEvent[];
  readonly selectedIntegration: RegisteredWebhookIntegration | null;
  readonly _selectedEventId: string | null;
  readonly setSelectedEventId: (eventId: string | null) => void;
  readonly triggerEventId: string | null;
  readonly filteredEvents: readonly ObservedWebhookEvent[];
  readonly selectedObservedEvent: ObservedWebhookEvent | null;
  readonly filters: WebhookEventFilters;
  readonly setFilters: (filters: WebhookEventFilters) => void;
  readonly clipboardState: "idle" | "copied" | "failed";
  readonly provider: ReturnType<typeof getWebhookProvider>;
  readonly validation: ReturnType<typeof validateWebhookDraft>;
  readonly updateDraft: (patch: Partial<WebhookIntegrationDraft>) => void;
  readonly registerIntegration: () => void;
  readonly triggerTestEvent: () => void;
  readonly copyEndpointPath: () => Promise<void>;
  readonly handleSelectIntegration: (integration: RegisteredWebhookIntegration) => void;
}) {
  const shellClass =
    variant === "standalone" ? "min-h-screen bg-canvas px-4 py-5 sm:px-6 lg:px-8" : "space-y-6";

  return (
    <div className={shellClass}>
      <div className={cn("mx-auto w-full", variant === "standalone" && "max-w-[1500px]")}>
        <WorkbenchHeader
          variant={variant}
          integrationCount={integrations.length}
          eventCount={observedEvents.length}
          enabledEventCount={countEnabledEvents(integrations)}
        />

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <section className="glass-panel rounded-lg p-4">
            <ProviderPicker draft={draft} onChange={setDraft} />
            <RegistrationForm
              clipboardState={clipboardState}
              draft={draft}
              provider={provider}
              validationMessage={validation.message}
              onCopyEndpoint={copyEndpointPath}
              onDraftChange={updateDraft}
              onRegister={registerIntegration}
            />
          </section>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
            <section className="glass-panel rounded-lg p-4">
              <IntegrationList
                integrations={integrations}
                selectedIntegrationId={selectedIntegration?.id ?? null}
                onSelect={handleSelectIntegration}
              />
              <RouteDesigner draft={draft} onDraftChange={updateDraft} />
            </section>

            <section className="glass-panel rounded-lg p-4">
              <TriggerPanel
                integration={selectedIntegration}
                selectedEventId={triggerEventId}
                onEventChange={setSelectedEventId}
                onTrigger={triggerTestEvent}
              />
            </section>
          </div>
        </div>

        <section className="mt-5 glass-panel rounded-lg p-4">
          <EventExplorer
            events={filteredEvents}
            filters={filters}
            onFiltersChange={setFilters}
            selectedEvent={selectedObservedEvent}
          />
        </section>
      </div>
    </div>
  );
}

function WorkbenchHeader({
  variant,
  integrationCount,
  eventCount,
  enabledEventCount,
}: {
  readonly variant: "embedded" | "standalone";
  readonly integrationCount: number;
  readonly eventCount: number;
  readonly enabledEventCount: number;
}) {
  const metrics = [
    { label: "Integrations", value: String(integrationCount) },
    { label: "Enabled events", value: String(enabledEventCount) },
    { label: "Observed events", value: String(eventCount) },
  ] as const;

  return (
    <header className={cn("glass-panel rounded-lg p-5", variant === "embedded" && "bg-panel")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Webhooks module</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink md:text-3xl">
            Integration workbench
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Register event sources, dry-run routing, and inspect delivery timelines before agent
            execution is connected.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xs border border-line/80 bg-ink/[0.03] p-3">
              <p className="eyebrow">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold text-ink">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

function ProviderPicker({
  draft,
  onChange,
}: {
  readonly draft: WebhookIntegrationDraft;
  readonly onChange: (draft: WebhookIntegrationDraft) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Provider</p>
          <h2 className="text-base font-semibold text-ink">Event source</h2>
        </div>
        <span className="pill text-info">No agent tokens</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
        {WEBHOOK_PROVIDER_CATALOG.map((provider) => {
          const active = draft.providerId === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              className={cn(
                "rounded-xs border p-3 text-left transition-all",
                active
                  ? "border-cyan/70 bg-cyan/10 shadow-glow"
                  : "border-line/80 bg-ink/[0.03] hover:border-info/60 hover:bg-info/10"
              )}
              onClick={() => onChange(switchWebhookDraftProvider(draft, provider.id))}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink">{provider.label}</span>
                <span
                  className={cn(
                    "pill px-2 py-1 text-[11px]",
                    provider.receiverState === "live" ? "text-ok" : "text-muted"
                  )}
                >
                  {provider.receiverState === "live" ? "Receiver live" : "Receiver planned"}
                </span>
              </span>
              <span className="mt-2 block text-sm leading-5 text-muted">
                {provider.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RegistrationForm({
  clipboardState,
  draft,
  provider,
  validationMessage,
  onCopyEndpoint,
  onDraftChange,
  onRegister,
}: {
  readonly clipboardState: "idle" | "copied" | "failed";
  readonly draft: WebhookIntegrationDraft;
  readonly provider: ReturnType<typeof getWebhookProvider>;
  readonly validationMessage: string | null;
  readonly onCopyEndpoint: () => void;
  readonly onDraftChange: (patch: Partial<WebhookIntegrationDraft>) => void;
  readonly onRegister: () => void;
}) {
  return (
    <div className="mt-5 border-t border-line/70 pt-5">
      <div className="grid gap-3">
        <Field label="Integration name">
          <input
            className="h-10 w-full rounded-xs border border-line/80 bg-ink/[0.04] px-3 text-sm text-ink outline-none focus:border-info"
            value={draft.name}
            onChange={(event) => onDraftChange({ name: event.target.value })}
          />
        </Field>

        <Field label={provider.secretLabel}>
          <input
            className="h-10 w-full rounded-xs border border-line/80 bg-ink/[0.04] px-3 font-mono text-sm text-ink outline-none focus:border-info"
            value={draft.secretRef}
            onChange={(event) => onDraftChange({ secretRef: event.target.value })}
          />
        </Field>

        <Field label="Receiver path">
          <div className="flex gap-2">
            <input
              className="h-10 min-w-0 flex-1 rounded-xs border border-line/80 bg-ink/[0.04] px-3 font-mono text-sm text-muted"
              readOnly
              value={provider.endpointPath}
            />
            <button
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xs border border-line/80 bg-ink/[0.04] px-3 text-sm font-medium text-ink hover:border-info/60 hover:bg-info/10"
              type="button"
              onClick={onCopyEndpoint}
            >
              <Icon name="hook" className="h-4 w-4" />
              {clipboardState === "copied"
                ? "Copied"
                : clipboardState === "failed"
                  ? "Copy failed"
                  : "Copy"}
            </button>
          </div>
        </Field>

        <div>
          <p className="eyebrow">Events</p>
          <div className="mt-2 grid gap-2">
            {provider.events.map((event) => {
              const checked = draft.selectedEventIds.includes(event.id);
              return (
                <label
                  key={event.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xs border p-3",
                    checked ? "border-cyan/60 bg-cyan/10" : "border-line/80 bg-ink/[0.03]"
                  )}
                >
                  <input
                    checked={checked}
                    className="mt-1 h-4 w-4 accent-[rgb(var(--color-cyan))]"
                    type="checkbox"
                    aria-label={event.label}
                    onChange={() => onDraftChange(toggleWebhookDraftEvent(draft, event.id))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{event.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      {event.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            checked={draft.enabled}
            className="h-4 w-4 accent-[rgb(var(--color-cyan))]"
            type="checkbox"
            onChange={(event) => onDraftChange({ enabled: event.target.checked })}
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xs border border-transparent accent-gradient px-4 text-sm font-semibold text-[rgb(7_11_20)] shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
          disabled={validationMessage !== null}
          type="button"
          onClick={onRegister}
        >
          <Icon name="plus" className="h-4 w-4" />
          Register integration
        </button>
        {validationMessage ? (
          <p className="text-sm text-warn" role="status">
            {validationMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RouteDesigner({
  draft,
  onDraftChange,
}: {
  readonly draft: WebhookIntegrationDraft;
  readonly onDraftChange: (patch: Partial<WebhookIntegrationDraft>) => void;
}) {
  return (
    <div className="mt-5 border-t border-line/70 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Workflow route</p>
          <h2 className="text-base font-semibold text-ink">Event to processing logic</h2>
        </div>
        <span className="pill text-info">Phase 1 dry-run</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <Field label="Route name">
          <input
            className="h-10 w-full rounded-xs border border-line/80 bg-ink/[0.04] px-3 text-sm text-ink outline-none focus:border-info"
            value={draft.routeName}
            onChange={(event) => onDraftChange({ routeName: event.target.value })}
          />
        </Field>
        <Field label="Local processor">
          <input
            className="h-10 w-full rounded-xs border border-line/80 bg-ink/[0.04] px-3 font-mono text-sm text-ink outline-none focus:border-info"
            disabled={draft.routeMode !== "local_processor"}
            value={draft.localProcessor}
            onChange={(event) => onDraftChange({ localProcessor: event.target.value })}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {WEBHOOK_ROUTE_MODES.map((mode) => {
          const active = draft.routeMode === mode.id;
          return (
            <button
              key={mode.id}
              className={cn(
                "rounded-xs border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-cyan/70 bg-cyan/10"
                  : "border-line/80 bg-ink/[0.03] hover:border-info/60 hover:bg-info/10"
              )}
              disabled={mode.disabled}
              type="button"
              onClick={() => onDraftChange({ routeMode: mode.id })}
            >
              <span className="text-sm font-semibold text-ink">{mode.label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{mode.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IntegrationList({
  integrations,
  selectedIntegrationId,
  onSelect,
}: {
  readonly integrations: readonly RegisteredWebhookIntegration[];
  readonly selectedIntegrationId: string | null;
  readonly onSelect: (integration: RegisteredWebhookIntegration) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Registered</p>
          <h2 className="text-base font-semibold text-ink">Webhook integrations</h2>
        </div>
        <span className="text-sm text-muted">{integrations.length}</span>
      </div>

      {integrations.length === 0 ? (
        <div className="mt-3 rounded-xs border border-dashed border-line/80 bg-ink/[0.02] p-5 text-sm text-muted">
          No local integrations registered.
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {integrations.map((integration) => {
            const provider = getWebhookProvider(integration.providerId);
            const selected = integration.id === selectedIntegrationId;
            return (
              <button
                key={integration.id}
                className={cn(
                  "rounded-xs border p-3 text-left transition-all",
                  selected
                    ? "border-cyan/70 bg-cyan/10"
                    : "border-line/80 bg-ink/[0.03] hover:border-info/60 hover:bg-info/10"
                )}
                type="button"
                onClick={() => onSelect(integration)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink">{integration.name}</span>
                  <span
                    className={cn(
                      "pill px-2 py-1 text-[11px]",
                      integration.enabled ? "text-ok" : "text-muted"
                    )}
                  >
                    {integration.enabled ? "Enabled" : "Paused"}
                  </span>
                </span>
                <span className="mt-2 block text-xs text-muted">
                  {provider.label} · {integration.selectedEventIds.length} events ·{" "}
                  {routeModeLabel(integration.routeMode)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TriggerPanel({
  integration,
  selectedEventId,
  onEventChange,
  onTrigger,
}: {
  readonly integration: RegisteredWebhookIntegration | null;
  readonly selectedEventId: string | null;
  readonly onEventChange: (eventId: string) => void;
  readonly onTrigger: () => void;
}) {
  const provider = integration ? getWebhookProvider(integration.providerId) : null;
  const selectedEvent =
    provider && selectedEventId ? getWebhookEventDefinition(provider, selectedEventId) : null;

  return (
    <div className="h-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Test trigger</p>
          <h2 className="text-base font-semibold text-ink">Dry-run event</h2>
        </div>
        <Icon name="bolt" className="h-5 w-5 text-cyan" />
      </div>

      {!integration || !provider ? (
        <div className="mt-3 rounded-xs border border-dashed border-line/80 bg-ink/[0.02] p-5 text-sm text-muted">
          Register an integration to fire local test events.
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <Field label="Registered integration">
            <div className="rounded-xs border border-line/80 bg-ink/[0.03] p-3">
              <p className="text-sm font-medium text-ink">{integration.name}</p>
              <p className="mt-1 font-mono text-xs text-muted">{integration.endpointPath}</p>
            </div>
          </Field>

          <Field label="Event">
            <select
              className="h-10 w-full rounded-xs border border-line/80 bg-panel px-3 text-sm text-ink outline-none focus:border-info"
              value={selectedEventId ?? ""}
              onChange={(event) => onEventChange(event.target.value)}
            >
              {integration.selectedEventIds.map((eventId) => {
                const event = getWebhookEventDefinition(provider, eventId);
                return (
                  <option key={event.id} value={event.id}>
                    {event.label}
                  </option>
                );
              })}
            </select>
          </Field>

          {selectedEvent ? (
            <div className="rounded-xs border border-line/80 bg-ink/[0.03] p-3">
              <p className="eyebrow">Payload preview</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <PreviewPair label="Provider" value={provider.label} />
                <PreviewPair label="Action" value={selectedEvent.action} />
                <PreviewPair label="Target" value={selectedEvent.targetLabel} />
                <PreviewPair label="Route" value={routeModeLabel(integration.routeMode)} />
              </dl>
            </div>
          ) : null}

          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xs border border-transparent accent-gradient px-4 text-sm font-semibold text-[rgb(7_11_20)] shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedEventId}
            type="button"
            onClick={onTrigger}
          >
            <Icon name="bolt" className="h-4 w-4" />
            Trigger test event
          </button>
        </div>
      )}
    </div>
  );
}

function EventExplorer({
  events,
  filters,
  selectedEvent,
  onFiltersChange,
}: {
  readonly events: readonly ObservedWebhookEvent[];
  readonly filters: WebhookEventFilters;
  readonly selectedEvent: ObservedWebhookEvent | null;
  readonly onFiltersChange: (filters: WebhookEventFilters) => void;
}) {
  function updateFilters(patch: Partial<WebhookEventFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Observability</p>
          <h2 className="text-base font-semibold text-ink">Event timeline</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-[160px_160px_minmax(220px,1fr)]">
          <select
            className="h-10 rounded-xs border border-line/80 bg-panel px-3 text-sm text-ink outline-none focus:border-info"
            value={filters.providerId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateFilters({ providerId: event.target.value as WebhookEventFilters["providerId"] })
            }
          >
            <option value="all">All providers</option>
            {WEBHOOK_PROVIDER_CATALOG.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-xs border border-line/80 bg-panel px-3 text-sm text-ink outline-none focus:border-info"
            value={filters.status}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateFilters({ status: event.target.value as WebhookEventFilters["status"] })
            }
          >
            {EVENT_FILTER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : status}
              </option>
            ))}
          </select>
          <label className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted"
            />
            <input
              className="h-10 w-full rounded-xs border border-line/80 bg-panel pl-9 pr-3 text-sm text-ink outline-none focus:border-info"
              placeholder="Filter events"
              value={filters.query}
              onChange={(event) => updateFilters({ query: event.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        {events.length === 0 ? (
          <div className="rounded-xs border border-dashed border-line/80 bg-ink/[0.02] p-6 text-center text-sm text-muted">
            No observed events match the current filters.
          </div>
        ) : (
          <ul className="grid gap-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-xs border border-line/80 bg-ink/[0.03] p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {event.providerLabel} · {event.eventLabel}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-muted">
                      {event.id} · {event.targetLabel}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={event.status} />
                    <span className="font-mono text-xs text-muted">{event.processingMs}ms</span>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  {event.timeline.map((step) => (
                    <div key={step.label} className="rounded-xs bg-ink/[0.03] px-3 py-2">
                      <p className="truncate text-xs font-medium text-ink">{step.label}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">{step.durationMs}ms</p>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        <EventDetail event={selectedEvent} />
      </div>
    </div>
  );
}

function EventDetail({ event }: { readonly event: ObservedWebhookEvent | null }) {
  if (!event) {
    return (
      <aside className="rounded-xs border border-dashed border-line/80 bg-ink/[0.02] p-5 text-sm text-muted">
        Trigger an event to inspect payload, route, and timing details.
      </aside>
    );
  }

  return (
    <aside className="rounded-xs border border-line/80 bg-ink/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Drilldown</p>
          <h3 className="truncate text-base font-semibold text-ink">{event.eventLabel}</h3>
        </div>
        <StatusPill status={event.status} />
      </div>

      <dl className="mt-4 grid gap-2 text-sm">
        <PreviewPair label="Received" value={event.receivedAt} mono />
        <PreviewPair label="Route" value={event.routeName} />
        <PreviewPair label="Mode" value={routeModeLabel(event.routeMode)} />
        <PreviewPair label="Processing" value={`${event.processingMs}ms`} mono />
      </dl>

      <div className="mt-4">
        <p className="eyebrow">Payload</p>
        <dl className="mt-2 grid gap-2">
          {Object.entries(event.payload).map(([key, value]) => (
            <PreviewPair key={key} label={key} value={value} mono />
          ))}
        </dl>
      </div>
    </aside>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function PreviewPair({
  label,
  value,
  mono,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xs border border-line/60 bg-ink/[0.025] px-3 py-2">
      <dt className="text-[11px] uppercase text-muted">{label}</dt>
      <dd className={cn("mt-1 break-words text-xs text-ink", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { readonly status: WebhookEventStatus }) {
  const tone =
    status === "failed" || status === "dlq"
      ? "text-danger"
      : status === "accepted" || status === "triggered"
        ? "text-info"
        : status === "completed" || status === "routed"
          ? "text-ok"
          : "text-muted";
  return <span className={cn("pill px-2 py-1 text-[11px]", tone)}>{status}</span>;
}

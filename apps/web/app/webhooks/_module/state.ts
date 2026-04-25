import type { WebhookDelivery } from "@control-plane/core";

import {
  DEFAULT_LOCAL_PROCESSOR,
  DEFAULT_WEBHOOK_PROVIDER_ID,
  DEFAULT_WEBHOOK_ROUTE_MODE,
  WEBHOOK_PROVIDER_CATALOG,
} from "./catalog";

import type {
  ObservedWebhookEvent,
  RegisteredWebhookIntegration,
  WebhookEventCategory,
  WebhookEventFilters,
  WebhookEventStatus,
  WebhookIntegrationDraft,
  WebhookIntegrationStatus,
  WebhookProviderDefinition,
  WebhookProviderEventDefinition,
  WebhookProviderId,
  WebhookRegistrationValidation,
  WebhookRouteMode,
  WebhookTimelineStep,
} from "./types";

const ID_PREFIX = "wh";
const MIN_PROCESSING_MS = 64;
const PROCESSING_VARIANCE_MS = 240;
const PROCESSING_STEP_COUNT = 4;
const DEFAULT_ROUTE_NAME = "Intake router";

export function getWebhookProvider(providerId: WebhookProviderId): WebhookProviderDefinition {
  return (
    WEBHOOK_PROVIDER_CATALOG.find((provider) => provider.id === providerId) ??
    WEBHOOK_PROVIDER_CATALOG[0]
  );
}

export function getWebhookEventDefinition(
  provider: WebhookProviderDefinition,
  eventId: string
): WebhookProviderEventDefinition {
  return provider.events.find((event) => event.id === eventId) ?? provider.events[0];
}

export function createDefaultWebhookDraft(
  providerId: WebhookProviderId = DEFAULT_WEBHOOK_PROVIDER_ID
): WebhookIntegrationDraft {
  const provider = getWebhookProvider(providerId);
  return {
    providerId: provider.id,
    name: `${provider.label} intake`,
    secretRef: `env:${provider.id.toUpperCase()}_WEBHOOK_SECRET`,
    selectedEventIds: provider.events.slice(0, 2).map((event) => event.id),
    routeMode: DEFAULT_WEBHOOK_ROUTE_MODE,
    routeName: DEFAULT_ROUTE_NAME,
    localProcessor: DEFAULT_LOCAL_PROCESSOR,
    enabled: true,
  };
}

export function switchWebhookDraftProvider(
  draft: WebhookIntegrationDraft,
  providerId: WebhookProviderId
): WebhookIntegrationDraft {
  const next = createDefaultWebhookDraft(providerId);
  return {
    ...next,
    routeMode: draft.routeMode === "agent_handoff" ? DEFAULT_WEBHOOK_ROUTE_MODE : draft.routeMode,
    routeName: draft.routeName.trim().length > 0 ? draft.routeName : next.routeName,
    localProcessor:
      draft.localProcessor.trim().length > 0 ? draft.localProcessor : next.localProcessor,
    enabled: draft.enabled,
  };
}

export function toggleWebhookDraftEvent(
  draft: WebhookIntegrationDraft,
  eventId: string
): WebhookIntegrationDraft {
  const selected = new Set(draft.selectedEventIds);
  if (selected.has(eventId)) {
    selected.delete(eventId);
  } else {
    selected.add(eventId);
  }
  return { ...draft, selectedEventIds: Array.from(selected) };
}

export function validateWebhookDraft(
  draft: WebhookIntegrationDraft
): WebhookRegistrationValidation {
  if (draft.name.trim().length === 0) {
    return { ok: false, message: "Name is required." };
  }
  if (draft.secretRef.trim().length === 0) {
    return { ok: false, message: "Secret reference is required." };
  }
  if (draft.selectedEventIds.length === 0) {
    return { ok: false, message: "Select at least one event." };
  }
  if (draft.routeMode === "local_processor" && draft.localProcessor.trim().length === 0) {
    return { ok: false, message: "Local processor is required." };
  }
  if (draft.routeMode === "agent_handoff") {
    return { ok: false, message: "Agent handoff is reserved for Phase 2." };
  }
  return { ok: true, message: null };
}

export function registerWebhookIntegration(input: {
  readonly draft: WebhookIntegrationDraft;
  readonly sequence: number;
  readonly now: Date;
}): RegisteredWebhookIntegration {
  const provider = getWebhookProvider(input.draft.providerId);
  return {
    ...input.draft,
    id: createStableId("integration", input.sequence),
    name: input.draft.name.trim(),
    secretRef: input.draft.secretRef.trim(),
    routeName: input.draft.routeName.trim() || DEFAULT_ROUTE_NAME,
    localProcessor: input.draft.localProcessor.trim() || DEFAULT_LOCAL_PROCESSOR,
    createdAt: input.now.toISOString(),
    endpointPath: provider.endpointPath,
  };
}

export function createObservedWebhookEvent(input: {
  readonly integration: RegisteredWebhookIntegration;
  readonly eventId: string;
  readonly sequence: number;
  readonly now: Date;
}): ObservedWebhookEvent {
  const provider = getWebhookProvider(input.integration.providerId);
  const event = getWebhookEventDefinition(provider, input.eventId);
  const processingMs = processingTimeFor(input.sequence, input.integration.routeMode);
  const status: WebhookEventStatus = input.integration.enabled ? "routed" : "failed";
  return {
    id: createStableId("event", input.sequence),
    integrationId: input.integration.id,
    providerId: provider.id,
    providerLabel: provider.label,
    eventId: event.id,
    eventLabel: event.label,
    action: event.action,
    targetLabel: event.targetLabel,
    receivedAt: input.now.toISOString(),
    routeName: input.integration.routeName,
    routeMode: input.integration.routeMode,
    status,
    processingMs,
    timeline: createTimeline(input.integration.routeMode, status, processingMs),
    payload: createSyntheticPayload(provider, event),
    repository: event.targetLabel.split("#")[0] ?? event.targetLabel,
  };
}

export function filterObservedWebhookEvents(
  events: readonly ObservedWebhookEvent[],
  filters: WebhookEventFilters
): readonly ObservedWebhookEvent[] {
  const query = filters.query.trim().toLowerCase();
  return events.filter((event) => {
    if (filters.providerId !== "all" && event.providerId !== filters.providerId) return false;
    if (filters.status !== "all" && event.status !== filters.status) return false;
    if (filters.repo !== undefined && filters.repo !== "all" && event.repository !== filters.repo)
      return false;
    if (query.length === 0) return true;
    return [
      event.providerLabel,
      event.eventLabel,
      event.action,
      event.targetLabel,
      event.routeName,
      event.id,
    ].some((value) => value.toLowerCase().includes(query));
  });
}

export function countEnabledEvents(integrations: readonly RegisteredWebhookIntegration[]): number {
  return integrations.reduce((total, integration) => {
    return integration.enabled ? total + integration.selectedEventIds.length : total;
  }, 0);
}

export function routeModeLabel(routeMode: WebhookRouteMode): string {
  if (routeMode === "store_only") return "Store event";
  if (routeMode === "normalize_and_queue") return "Normalize and queue";
  if (routeMode === "local_processor") return "Local processor";
  return "Agent handoff";
}

export function getIntegrationStatus(
  integration: RegisteredWebhookIntegration
): WebhookIntegrationStatus {
  const provider = getWebhookProvider(integration.providerId);
  return provider.receiverState === "live" ? "live" : "planned";
}

export function groupEventsByCategory(
  events: readonly ObservedWebhookEvent[]
): Record<WebhookEventCategory, ObservedWebhookEvent[]> {
  const grouped: Record<WebhookEventCategory, ObservedWebhookEvent[]> = {
    pull_requests: [],
    issues: [],
    ci: [],
    other: [],
  };

  for (const event of events) {
    const id = event.eventId.toLowerCase();
    if (id.includes("pull_request")) {
      grouped.pull_requests.push(event);
    } else if (id.includes("issue")) {
      grouped.issues.push(event);
    } else if (id.includes("workflow") || id.includes("ci")) {
      grouped.ci.push(event);
    } else {
      grouped.other.push(event);
    }
  }

  return grouped;
}

export function computeStats(events: readonly ObservedWebhookEvent[]) {
  const total24h = events.length;
  const activeProcessing = events.filter((e) => e.status === "processing").length;
  const failedDlq = events.filter((e) => e.status === "failed" || e.status === "dlq").length;
  const avgProcessingTime =
    events.length > 0 ? events.reduce((sum, e) => sum + e.processingMs, 0) / events.length : 0;

  return {
    total24h,
    activeProcessing,
    failedDlq,
    avgProcessingTime,
  };
}

export function getProviderBreakdown(
  events: readonly ObservedWebhookEvent[]
): Record<WebhookProviderId, number> {
  const breakdown: Record<WebhookProviderId, number> = {
    github: 0,
    slack: 0,
    email: 0,
  };

  for (const event of events) {
    if (event.providerId in breakdown) {
      breakdown[event.providerId] += 1;
    }
  }

  return breakdown;
}

export function deliveryToObservedEvent(
  delivery: WebhookDelivery,
  sequence: number
): ObservedWebhookEvent {
  const meta = (delivery.metadata ?? {}) as Record<string, unknown>;
  const githubEvent = typeof meta.githubEvent === "string" ? meta.githubEvent : "";
  const action = typeof meta.action === "string" ? meta.action : "received";
  const repo = typeof meta.repositoryFullName === "string" ? meta.repositoryFullName : "";
  const eventId = githubEvent || delivery.eventType;
  const eventLabel = eventId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const status: WebhookEventStatus =
    delivery.status === "delivered"
      ? "accepted"
      : delivery.status === "failed"
        ? "failed"
        : "processing";
  const payload = Object.entries(meta).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      acc[k] = String(v);
    }
    return acc;
  }, {});
  return {
    id: delivery.id,
    integrationId: delivery.subscriptionId,
    providerId: "github",
    providerLabel: "GitHub",
    eventId,
    eventLabel,
    action,
    targetLabel: repo || delivery.subscriptionId,
    receivedAt: delivery.attemptedAt,
    routeName: "store_only",
    routeMode: "store_only",
    status,
    processingMs: (sequence % 5) * 12 + 8,
    timeline: [
      {
        label: "Received provider event",
        status: "completed",
        durationMs: 4,
        step: "triggered",
        timestamp: delivery.attemptedAt,
      },
      {
        label: "Verified HMAC signature",
        status: "completed",
        durationMs: 2,
        step: "queued",
        timestamp: delivery.attemptedAt,
      },
      {
        label: "Stored delivery",
        status: delivery.status === "failed" ? "failed" : "completed",
        durationMs: 2,
        step: "completed",
        timestamp: delivery.attemptedAt,
      },
    ],
    payload,
    repository: repo,
  };
}

function createTimeline(
  routeMode: WebhookRouteMode,
  status: WebhookEventStatus,
  processingMs: number
): readonly WebhookTimelineStep[] {
  const stepMs = Math.max(1, Math.round(processingMs / PROCESSING_STEP_COUNT));
  const lastLabel =
    routeMode === "store_only"
      ? "Stored delivery"
      : routeMode === "local_processor"
        ? "Local processor completed"
        : routeMode === "normalize_and_queue"
          ? "Queued canonical event"
          : "Agent handoff skipped";
  const lastStep = status === "failed" ? "failed" : "completed";

  return [
    {
      label: "Received provider event",
      status: "completed",
      durationMs: stepMs,
      step: "triggered",
    },
    { label: "Verified registration", status: "completed", durationMs: stepMs, step: "queued" },
    {
      label: "Matched route",
      status: status === "failed" ? "failed" : "completed",
      durationMs: stepMs,
      step: "processing",
    },
    {
      label: lastLabel,
      status: lastStep,
      durationMs: Math.max(1, processingMs - stepMs * 3),
      step: "completed",
    },
  ];
}

function createSyntheticPayload(
  provider: WebhookProviderDefinition,
  event: WebhookProviderEventDefinition
): Record<string, string> {
  return {
    provider: provider.id,
    event: event.id,
    action: event.action,
    target: event.targetLabel,
    receiver: provider.endpointPath,
  };
}

function processingTimeFor(sequence: number, routeMode: WebhookRouteMode): number {
  const modeWeight =
    routeMode === "store_only"
      ? 20
      : routeMode === "local_processor"
        ? 96
        : routeMode === "normalize_and_queue"
          ? 48
          : 160;
  return MIN_PROCESSING_MS + ((sequence * 37 + modeWeight) % PROCESSING_VARIANCE_MS);
}

function createStableId(kind: "event" | "integration", sequence: number): string {
  return `${ID_PREFIX}-${kind}-${String(sequence).padStart(3, "0")}`;
}

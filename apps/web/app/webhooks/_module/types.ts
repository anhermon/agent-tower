export const WEBHOOK_PROVIDER_IDS = {
  GitHub: "github",
  Slack: "slack",
  Email: "email",
} as const;

export type WebhookProviderId = (typeof WEBHOOK_PROVIDER_IDS)[keyof typeof WEBHOOK_PROVIDER_IDS];

export type WebhookReceiverState = "live" | "planned";

export type WebhookRouteMode =
  | "store_only"
  | "normalize_and_queue"
  | "local_processor"
  | "agent_handoff";

export type WebhookObservedStatus = "accepted" | "routed" | "failed";

export type WebhookEventStatus =
  | "accepted"
  | "routed"
  | "triggered"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "dlq";

export type WebhookEventCategory = "pull_requests" | "issues" | "ci" | "other";

export type WebhookIntegrationStatus = "live" | "planned" | "setup";

export interface WebhookProviderEventDefinition {
  readonly id: string;
  readonly label: string;
  readonly action: string;
  readonly description: string;
  readonly targetLabel: string;
}

export interface WebhookProviderDefinition {
  readonly id: WebhookProviderId;
  readonly label: string;
  readonly receiverState: WebhookReceiverState;
  readonly endpointPath: string;
  readonly secretLabel: string;
  readonly description: string;
  readonly events: readonly WebhookProviderEventDefinition[];
}

export interface WebhookIntegrationDraft {
  readonly providerId: WebhookProviderId;
  readonly name: string;
  readonly secretRef: string;
  readonly selectedEventIds: readonly string[];
  readonly routeMode: WebhookRouteMode;
  readonly routeName: string;
  readonly localProcessor: string;
  readonly enabled: boolean;
}

export interface RegisteredWebhookIntegration extends WebhookIntegrationDraft {
  readonly id: string;
  readonly createdAt: string;
  readonly endpointPath: string;
}

export interface WebhookTimelineStep {
  readonly label: string;
  readonly status: "pending" | "completed" | "failed";
  readonly durationMs: number;
  readonly step: string;
  readonly timestamp?: string;
  readonly error?: string;
}

export interface ObservedWebhookEvent {
  readonly id: string;
  readonly integrationId: string;
  readonly providerId: WebhookProviderId;
  readonly providerLabel: string;
  readonly eventId: string;
  readonly eventLabel: string;
  readonly action: string;
  readonly targetLabel: string;
  readonly receivedAt: string;
  readonly routeName: string;
  readonly routeMode: WebhookRouteMode;
  readonly status: WebhookEventStatus;
  readonly processingMs: number;
  readonly timeline: readonly WebhookTimelineStep[];
  readonly payload: Record<string, string>;
  readonly repository: string;
}

export interface WebhookEventFilters {
  readonly providerId: WebhookProviderId | "all";
  readonly status: WebhookEventStatus | "all";
  readonly query: string;
  readonly repo?: string;
  readonly timeFrom?: string;
  readonly timeTo?: string;
}

export interface WebhookRegistrationValidation {
  readonly ok: boolean;
  readonly message: string | null;
}

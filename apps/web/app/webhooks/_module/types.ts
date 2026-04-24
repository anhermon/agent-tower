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
  readonly status: WebhookObservedStatus;
  readonly durationMs: number;
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
  readonly status: WebhookObservedStatus;
  readonly processingMs: number;
  readonly timeline: readonly WebhookTimelineStep[];
  readonly payload: Record<string, string>;
}

export interface WebhookEventFilters {
  readonly providerId: WebhookProviderId | "all";
  readonly status: WebhookObservedStatus | "all";
  readonly query: string;
}

export interface WebhookRegistrationValidation {
  readonly ok: boolean;
  readonly message: string | null;
}

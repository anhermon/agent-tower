export const EVENT_ENVELOPE_VERSION = 1 as const;

export enum ControlPlaneEventType {
  AgentRegistered = "agent.registered",
  AgentUpdated = "agent.updated",
  AgentStatusChanged = "agent.status_changed",
  SessionStarted = "session.started",
  SessionUpdated = "session.updated",
  SessionEnded = "session.ended",
  WebhookReceived = "webhook.received",
  ModuleRegistered = "module.registered",
  ModuleUpdated = "module.updated",
  AuditEntryRecorded = "audit.entry_recorded",
}

export enum EventSourceKind {
  Agent = "agent",
  Session = "session",
  Webhook = "webhook",
  ModuleRegistry = "module_registry",
  System = "system",
  User = "user",
}

export enum EventActorKind {
  Agent = "agent",
  Service = "service",
  System = "system",
  User = "user",
}

export type EventId = string;
export type EventType = ControlPlaneEventType | (string & {});
export type EventTimestamp = string;

export interface EventSource {
  readonly kind: EventSourceKind;
  readonly id: string;
}

export interface EventActor {
  readonly kind: EventActorKind;
  readonly id: string;
  readonly displayName?: string;
}

export interface EventMetadata {
  readonly traceId?: string;
  readonly tags?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface EventEnvelope<
  TType extends EventType = EventType,
  TPayload = unknown,
  TMetadata extends EventMetadata = EventMetadata,
> {
  readonly id: EventId;
  readonly type: TType;
  readonly version: typeof EVENT_ENVELOPE_VERSION;
  readonly occurredAt: EventTimestamp;
  readonly source: EventSource;
  readonly actor?: EventActor;
  readonly payload: TPayload;
  readonly metadata?: TMetadata;
  readonly correlationId?: string;
  readonly causationId?: EventId;
}

export interface EventSubscriptionFilter<TType extends EventType = EventType> {
  readonly types?: readonly TType[];
  readonly sourceKinds?: readonly EventSourceKind[];
  readonly sourceIds?: readonly string[];
}

export interface EventSubscription {
  readonly id: string;
  unsubscribe(): void;
}

export type EventHandler<TEvent extends EventEnvelope = EventEnvelope> = (
  event: TEvent,
) => void | Promise<void>;

export type AsyncEventStream<TValue> = AsyncIterable<TValue>;

export type EventStream<TEvent extends EventEnvelope = EventEnvelope> = AsyncEventStream<TEvent>;

export interface EventPublishOptions {
  readonly signal?: AbortSignal;
}

export enum AgentStatus {
  Idle = "idle",
  Starting = "starting",
  Running = "running",
  Paused = "paused",
  Failed = "failed",
  Stopped = "stopped",
}

export enum SessionStatus {
  Active = "active",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

export enum WebhookStatus {
  Received = "received",
  Processing = "processing",
  Processed = "processed",
  Failed = "failed",
}

export enum ModuleStatus {
  Draft = "draft",
  Active = "active",
  Deprecated = "deprecated",
  Disabled = "disabled",
}

export enum AuditActorKind {
  Agent = "agent",
  Service = "service",
  System = "system",
  User = "user",
}

export enum AuditTargetKind {
  Agent = "agent",
  Session = "session",
  Webhook = "webhook",
  Module = "module",
  Event = "event",
  System = "system",
}

export interface AgentRecord {
  readonly id: string;
  readonly name: string;
  readonly status: AgentStatus;
  readonly capabilities: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SessionRecord {
  readonly id: string;
  readonly agentId: string;
  readonly status: SessionStatus;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PersistedEventEnvelope<
  TType extends string = string,
  TPayload = unknown,
  TSource extends PersistedEventSource = PersistedEventSource,
> {
  readonly id: string;
  readonly type: TType;
  readonly occurredAt: string;
  readonly source: TSource;
  readonly payload: TPayload;
}

export interface PersistedEventSource {
  readonly kind: string;
  readonly id: string;
}

export interface EventRecord<TEvent extends PersistedEventEnvelope = PersistedEventEnvelope> {
  readonly id: string;
  readonly sequence: number;
  readonly event: TEvent;
  readonly appendedAt: string;
}

export interface WebhookRecord {
  readonly id: string;
  readonly provider: string;
  readonly status: WebhookStatus;
  readonly receivedAt: string;
  readonly processedAt?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly payload: unknown;
}

export interface ModuleRegistryRecord {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly status: ModuleStatus;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly registeredAt: string;
  readonly updatedAt: string;
}

export interface AuditEntryRecord {
  readonly id: string;
  readonly action: string;
  readonly actorKind: AuditActorKind;
  readonly actorId: string;
  readonly targetKind: AuditTargetKind;
  readonly targetId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

import type { TicketPriority, TicketRecord, TicketStatus } from "@control-plane/core";

import type {
  AgentRecord,
  AuditEntryRecord,
  EventRecord,
  ModuleRegistryRecord,
  PersistedEventEnvelope,
  SessionRecord,
  WebhookRecord,
} from "./models.js";

export enum RepositoryListOrder {
  Ascending = "asc",
  Descending = "desc",
}

export interface RepositoryListOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly order?: RepositoryListOrder;
}

export interface EntityRepository<TRecord extends { readonly id: string }, TCreate = TRecord> {
  create(record: TCreate): Promise<TRecord>;
  getById(id: string): Promise<TRecord | undefined>;
  list(options?: RepositoryListOptions): Promise<readonly TRecord[]>;
  update(id: string, patch: Partial<TRecord>): Promise<TRecord>;
  delete(id: string): Promise<boolean>;
}

export interface AgentRepository extends EntityRepository<AgentRecord> {
  listByStatus(status: AgentRecord["status"]): Promise<readonly AgentRecord[]>;
}

export interface SessionRepository extends EntityRepository<SessionRecord> {
  listByAgentId(agentId: string): Promise<readonly SessionRecord[]>;
}

export interface EventRepository<TEvent extends PersistedEventEnvelope = PersistedEventEnvelope> {
  append(event: TEvent): Promise<EventRecord<TEvent>>;
  getById(id: string): Promise<EventRecord<TEvent> | undefined>;
  list(options?: RepositoryListOptions): Promise<readonly EventRecord<TEvent>[]>;
  listAfterSequence(sequence: number, limit?: number): Promise<readonly EventRecord<TEvent>[]>;
}

export interface WebhookRepository extends EntityRepository<WebhookRecord> {
  listByProvider(provider: string): Promise<readonly WebhookRecord[]>;
}

export interface ModuleRegistryRepository extends EntityRepository<ModuleRegistryRecord> {
  findByName(name: string): Promise<readonly ModuleRegistryRecord[]>;
}

export interface AuditEntryRepository extends EntityRepository<AuditEntryRecord> {
  listByTarget(targetId: string): Promise<readonly AuditEntryRecord[]>;
}

/** Input shape for creating a new ticket (server assigns id, timestamps). */
export interface CreateTicketInput {
  readonly title: string;
  readonly description?: string;
  readonly priority?: TicketPriority;
  readonly assigneeAgentId?: string;
}

/** Input shape for updating a ticket (all fields optional except status changes). */
export interface UpdateTicketInput {
  readonly status?: TicketStatus;
  readonly assigneeAgentId?: string;
  readonly sessionId?: string;
  readonly comment?: string;
}

export interface TicketRepository extends EntityRepository<TicketRecord, CreateTicketInput> {
  listByStatus(status: TicketStatus): Promise<readonly TicketRecord[]>;
  listByAgentId(agentId: string): Promise<readonly TicketRecord[]>;
}

export interface ControlPlaneRepositories {
  readonly agents: AgentRepository;
  readonly sessions: SessionRepository;
  readonly events: EventRepository;
  readonly webhooks: WebhookRepository;
  readonly modules: ModuleRegistryRepository;
  readonly auditEntries: AuditEntryRepository;
  readonly tickets: TicketRepository;
}

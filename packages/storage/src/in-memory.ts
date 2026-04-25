/* eslint-disable @typescript-eslint/require-await -- in-memory methods implement async repository interfaces with synchronous stubs */
import { randomUUID } from "node:crypto";

import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketRecord,
  type TicketStatus,
} from "@control-plane/core";

import {
  type AgentRepository,
  type AuditEntryRepository,
  type ControlPlaneRepositories,
  type CreateTicketInput,
  type EntityRepository,
  type EventRepository,
  type ModuleRegistryRepository,
  type RepositoryListOptions,
  RepositoryListOrder,
  type SessionRepository,
  type TicketRepository,
  type WebhookRepository,
} from "./repositories.js";

import type {
  AgentRecord,
  AuditEntryRecord,
  EventRecord,
  ModuleRegistryRecord,
  PersistedEventEnvelope,
  SessionRecord,
  WebhookRecord,
} from "./models.js";

export class InMemoryEntityRepository<TRecord extends { readonly id: string }>
  implements EntityRepository<TRecord>
{
  protected readonly records = new Map<string, TRecord>();

  async create(record: TRecord): Promise<TRecord> {
    if (this.records.has(record.id)) {
      throw new Error(`Record already exists: ${record.id}`);
    }

    this.records.set(record.id, record);
    return record;
  }

  async getById(id: string): Promise<TRecord | undefined> {
    return this.records.get(id);
  }

  async list(options: RepositoryListOptions = {}): Promise<readonly TRecord[]> {
    return applyListOptions(Array.from(this.records.values()), options);
  }

  async update(id: string, patch: Partial<TRecord>): Promise<TRecord> {
    const current = this.records.get(id);

    if (!current) {
      throw new Error(`Record does not exist: ${id}`);
    }

    const updated = { ...current, ...patch, id };
    this.records.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
  }
}

export class InMemoryAgentRepository
  extends InMemoryEntityRepository<AgentRecord>
  implements AgentRepository
{
  async listByStatus(status: AgentRecord["status"]): Promise<readonly AgentRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.status === status);
  }
}

export class InMemorySessionRepository
  extends InMemoryEntityRepository<SessionRecord>
  implements SessionRepository
{
  async listByAgentId(agentId: string): Promise<readonly SessionRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.agentId === agentId);
  }
}

export class InMemoryEventRepository<TEvent extends PersistedEventEnvelope = PersistedEventEnvelope>
  implements EventRepository<TEvent>
{
  private readonly records = new Map<string, EventRecord<TEvent>>();
  private sequence = 0;

  async append(event: TEvent): Promise<EventRecord<TEvent>> {
    if (this.records.has(event.id)) {
      throw new Error(`Event already exists: ${event.id}`);
    }

    const record: EventRecord<TEvent> = {
      id: event.id,
      sequence: ++this.sequence,
      event,
      appendedAt: new Date().toISOString(),
    };

    this.records.set(record.id, record);
    return record;
  }

  async getById(id: string): Promise<EventRecord<TEvent> | undefined> {
    return this.records.get(id);
  }

  async list(options: RepositoryListOptions = {}): Promise<readonly EventRecord<TEvent>[]> {
    return applyListOptions(Array.from(this.records.values()), options);
  }

  async listAfterSequence(
    sequence: number,
    limit?: number
  ): Promise<readonly EventRecord<TEvent>[]> {
    const records = Array.from(this.records.values()).filter(
      (record) => record.sequence > sequence
    );
    return typeof limit === "number" ? records.slice(0, limit) : records;
  }

  clear(): void {
    this.records.clear();
    this.sequence = 0;
  }
}

export class InMemoryWebhookRepository
  extends InMemoryEntityRepository<WebhookRecord>
  implements WebhookRepository
{
  async listByProvider(provider: string): Promise<readonly WebhookRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.provider === provider);
  }
}

export class InMemoryModuleRegistryRepository
  extends InMemoryEntityRepository<ModuleRegistryRecord>
  implements ModuleRegistryRepository
{
  async findByName(name: string): Promise<readonly ModuleRegistryRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.name === name);
  }
}

export class InMemoryAuditEntryRepository
  extends InMemoryEntityRepository<AuditEntryRecord>
  implements AuditEntryRepository
{
  async listByTarget(targetId: string): Promise<readonly AuditEntryRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.targetId === targetId);
  }
}

export class InMemoryTicketRepository implements TicketRepository {
  private readonly records = new Map<string, TicketRecord>();

  async create(input: CreateTicketInput): Promise<TicketRecord> {
    const now = new Date().toISOString();
    const ticket: TicketRecord = {
      id: randomUUID(),
      title: input.title,
      status: TICKET_STATUSES.Open,
      priority: input.priority ?? TICKET_PRIORITIES.Normal,
      createdAt: now,
      updatedAt: now,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.assigneeAgentId !== undefined ? { assigneeAgentId: input.assigneeAgentId } : {}),
    };
    this.records.set(ticket.id, ticket);
    return ticket;
  }

  async getById(id: string): Promise<TicketRecord | undefined> {
    return this.records.get(id);
  }

  async list(options: RepositoryListOptions = {}): Promise<readonly TicketRecord[]> {
    return applyListOptions(Array.from(this.records.values()), options);
  }

  async update(id: string, patch: Partial<TicketRecord>): Promise<TicketRecord> {
    const current = this.records.get(id);
    if (!current) {
      throw new Error(`Ticket does not exist: ${id}`);
    }
    const updated: TicketRecord = {
      ...current,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  async listByStatus(status: TicketStatus): Promise<readonly TicketRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.status === status);
  }

  async listByAgentId(agentId: string): Promise<readonly TicketRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.assigneeAgentId === agentId);
  }

  /** Seed the store from externally-loaded tickets (e.g., from a configured file). */
  seed(tickets: readonly TicketRecord[]): void {
    for (const ticket of tickets) {
      this.records.set(ticket.id, ticket);
    }
  }

  clear(): void {
    this.records.clear();
  }
}

export class InMemoryControlPlaneRepositories implements ControlPlaneRepositories {
  readonly agents = new InMemoryAgentRepository();
  readonly sessions = new InMemorySessionRepository();
  readonly events = new InMemoryEventRepository();
  readonly webhooks = new InMemoryWebhookRepository();
  readonly modules = new InMemoryModuleRegistryRepository();
  readonly auditEntries = new InMemoryAuditEntryRepository();
  readonly tickets = new InMemoryTicketRepository();
}

function applyListOptions<TRecord>(
  records: readonly TRecord[],
  options: RepositoryListOptions
): readonly TRecord[] {
  const ordered =
    options.order === RepositoryListOrder.Descending
      ? Array.from(records).reverse()
      : Array.from(records);
  const offset = options.offset ?? 0;
  const end = typeof options.limit === "number" ? offset + options.limit : undefined;

  return ordered.slice(offset, end);
}

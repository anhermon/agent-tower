import {
  type AgentRepository,
  type AuditEntryRepository,
  type ControlPlaneRepositories,
  type EntityRepository,
  type EventRepository,
  type ModuleRegistryRepository,
  type RepositoryListOptions,
  RepositoryListOrder,
  type SessionRepository,
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

  create(record: TRecord): Promise<TRecord> {
    if (this.records.has(record.id)) {
      return Promise.reject(new Error(`Record already exists: ${record.id}`));
    }

    this.records.set(record.id, record);
    return Promise.resolve(record);
  }

  getById(id: string): Promise<TRecord | undefined> {
    return Promise.resolve(this.records.get(id));
  }

  list(options: RepositoryListOptions = {}): Promise<readonly TRecord[]> {
    return Promise.resolve(applyListOptions(Array.from(this.records.values()), options));
  }

  update(id: string, patch: Partial<TRecord>): Promise<TRecord> {
    const current = this.records.get(id);

    if (!current) {
      return Promise.reject(new Error(`Record does not exist: ${id}`));
    }

    const updated = { ...current, ...patch, id } as TRecord;
    this.records.set(id, updated);
    return Promise.resolve(updated);
  }

  delete(id: string): Promise<boolean> {
    return Promise.resolve(this.records.delete(id));
  }

  clear(): void {
    this.records.clear();
  }
}

export class InMemoryAgentRepository
  extends InMemoryEntityRepository<AgentRecord>
  implements AgentRepository
{
  listByStatus(status: AgentRecord["status"]): Promise<readonly AgentRecord[]> {
    return Promise.resolve(
      Array.from(this.records.values()).filter((record) => record.status === status)
    );
  }
}

export class InMemorySessionRepository
  extends InMemoryEntityRepository<SessionRecord>
  implements SessionRepository
{
  listByAgentId(agentId: string): Promise<readonly SessionRecord[]> {
    return Promise.resolve(
      Array.from(this.records.values()).filter((record) => record.agentId === agentId)
    );
  }
}

export class InMemoryEventRepository<TEvent extends PersistedEventEnvelope = PersistedEventEnvelope>
  implements EventRepository<TEvent>
{
  private readonly records = new Map<string, EventRecord<TEvent>>();
  private sequence = 0;

  append(event: TEvent): Promise<EventRecord<TEvent>> {
    if (this.records.has(event.id)) {
      return Promise.reject(new Error(`Event already exists: ${event.id}`));
    }

    const record: EventRecord<TEvent> = {
      id: event.id,
      sequence: ++this.sequence,
      event,
      appendedAt: new Date().toISOString(),
    };

    this.records.set(record.id, record);
    return Promise.resolve(record);
  }

  getById(id: string): Promise<EventRecord<TEvent> | undefined> {
    return Promise.resolve(this.records.get(id));
  }

  list(options: RepositoryListOptions = {}): Promise<readonly EventRecord<TEvent>[]> {
    return Promise.resolve(applyListOptions(Array.from(this.records.values()), options));
  }

  listAfterSequence(sequence: number, limit?: number): Promise<readonly EventRecord<TEvent>[]> {
    const records = Array.from(this.records.values()).filter(
      (record) => record.sequence > sequence
    );
    return Promise.resolve(typeof limit === "number" ? records.slice(0, limit) : records);
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
  listByProvider(provider: string): Promise<readonly WebhookRecord[]> {
    return Promise.resolve(
      Array.from(this.records.values()).filter((record) => record.provider === provider)
    );
  }
}

export class InMemoryModuleRegistryRepository
  extends InMemoryEntityRepository<ModuleRegistryRecord>
  implements ModuleRegistryRepository
{
  findByName(name: string): Promise<readonly ModuleRegistryRecord[]> {
    return Promise.resolve(
      Array.from(this.records.values()).filter((record) => record.name === name)
    );
  }
}

export class InMemoryAuditEntryRepository
  extends InMemoryEntityRepository<AuditEntryRecord>
  implements AuditEntryRepository
{
  listByTarget(targetId: string): Promise<readonly AuditEntryRecord[]> {
    return Promise.resolve(
      Array.from(this.records.values()).filter((record) => record.targetId === targetId)
    );
  }
}

export class InMemoryControlPlaneRepositories implements ControlPlaneRepositories {
  readonly agents = new InMemoryAgentRepository();
  readonly sessions = new InMemorySessionRepository();
  readonly events = new InMemoryEventRepository();
  readonly webhooks = new InMemoryWebhookRepository();
  readonly modules = new InMemoryModuleRegistryRepository();
  readonly auditEntries = new InMemoryAuditEntryRepository();
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

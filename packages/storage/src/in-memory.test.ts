import { describe, expect, it } from "vitest";

import {
  InMemoryAgentRepository,
  InMemoryAuditEntryRepository,
  InMemoryControlPlaneRepositories,
  InMemoryEntityRepository,
  InMemoryEventRepository,
  InMemoryModuleRegistryRepository,
  InMemorySessionRepository,
  InMemoryWebhookRepository,
} from "./in-memory.js";
import {
  type AgentRecord,
  AgentStatus,
  AuditActorKind,
  AuditTargetKind,
  ModuleStatus,
  SessionStatus,
  WebhookStatus,
} from "./models.js";
import { RepositoryListOrder } from "./repositories.js";

const TS = "2026-01-01T00:00:00.000Z";

const AGENT = {
  id: "agent-1",
  name: "Builder",
  status: AgentStatus.Running,
  capabilities: ["session.streaming"] as string[],
  createdAt: TS,
  updatedAt: TS,
} as const;

const SESSION = {
  id: "session-1",
  agentId: "agent-1",
  status: SessionStatus.Active,
  startedAt: TS,
} as const;

const EVENT = {
  id: "event-1",
  type: "agent.registered",
  occurredAt: TS,
  source: { kind: "agent", id: "agent-1" },
  payload: {},
} as const;

const WEBHOOK = {
  id: "webhook-1",
  provider: "github",
  status: WebhookStatus.Received,
  receivedAt: TS,
  headers: { "content-type": "application/json" },
  payload: { action: "push" },
} as const;

const MODULE = {
  id: "module-1",
  name: "agents",
  version: "1.0.0",
  status: ModuleStatus.Active,
  manifest: { spec: "v1" },
  registeredAt: TS,
  updatedAt: TS,
} as const;

const AUDIT = {
  id: "audit-1",
  action: "agent.created",
  actorKind: AuditActorKind.System,
  actorId: "system",
  targetKind: AuditTargetKind.Agent,
  targetId: "agent-1",
  createdAt: TS,
} as const;

// ── InMemoryEntityRepository (base class) ─────────────────────────────────────

describe("InMemoryEntityRepository", () => {
  it("given_a_record__when_created__then_getById_returns_it", async () => {
    const repo = new InMemoryEntityRepository<AgentRecord>();
    await repo.create(AGENT);
    await expect(repo.getById("agent-1")).resolves.toEqual(AGENT);
  });

  it("given_no_record__when_getById_called__then_returns_undefined", async () => {
    const repo = new InMemoryEntityRepository<AgentRecord>();
    await expect(repo.getById("missing")).resolves.toBeUndefined();
  });

  it("given_an_existing_id__when_create_called_again__then_rejects", async () => {
    const repo = new InMemoryEntityRepository<AgentRecord>();
    await repo.create(AGENT);
    await expect(repo.create(AGENT)).rejects.toThrow("Record already exists: agent-1");
  });

  it("given_a_record__when_updated__then_patch_is_merged", async () => {
    const repo = new InMemoryEntityRepository<AgentRecord>();
    await repo.create(AGENT);
    const updated = await repo.update("agent-1", { name: "Refactored" });
    expect(updated.name).toBe("Refactored");
    expect(updated.id).toBe("agent-1");
  });

  it("given_a_missing_id__when_updated__then_rejects", async () => {
    const repo = new InMemoryEntityRepository<AgentRecord>();
    await expect(repo.update("missing", { name: "X" })).rejects.toThrow(
      "Record does not exist: missing"
    );
  });

  it("given_a_record__when_deleted__then_returns_true_and_is_gone", async () => {
    const repo = new InMemoryEntityRepository<AgentRecord>();
    await repo.create(AGENT);
    await expect(repo.delete("agent-1")).resolves.toBe(true);
    await expect(repo.getById("agent-1")).resolves.toBeUndefined();
  });

  it("given_a_missing_id__when_deleted__then_returns_false", async () => {
    const repo = new InMemoryEntityRepository<AgentRecord>();
    await expect(repo.delete("missing")).resolves.toBe(false);
  });

  it("given_records__when_cleared__then_list_is_empty", async () => {
    const repo = new InMemoryEntityRepository<AgentRecord>();
    await repo.create(AGENT);
    repo.clear();
    await expect(repo.list()).resolves.toEqual([]);
  });

  it("given_multiple_records__when_list_with_descending_order__then_returns_reversed", async () => {
    const repo = new InMemoryEntityRepository<{ id: string; name: string }>();
    await repo.create({ id: "a", name: "A" });
    await repo.create({ id: "b", name: "B" });
    await repo.create({ id: "c", name: "C" });

    const records = await repo.list({ order: RepositoryListOrder.Descending });
    expect(records.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("given_records__when_list_with_offset_and_limit__then_returns_slice", async () => {
    const repo = new InMemoryEntityRepository<{ id: string }>();
    for (const id of ["a", "b", "c", "d", "e"]) {
      await repo.create({ id });
    }

    const records = await repo.list({ offset: 1, limit: 2 });
    expect(records.map((r) => r.id)).toEqual(["b", "c"]);
  });
});

// ── InMemoryAgentRepository ───────────────────────────────────────────────────

describe("InMemoryAgentRepository", () => {
  it("given_agents_with_mixed_statuses__when_listByStatus__then_returns_matching_only", async () => {
    const repo = new InMemoryAgentRepository();
    await repo.create(AGENT);
    await repo.create({ ...AGENT, id: "agent-2", status: AgentStatus.Idle });

    const running = await repo.listByStatus(AgentStatus.Running);
    expect(running).toHaveLength(1);
    expect(running[0]!.id).toBe("agent-1");
  });
});

// ── InMemorySessionRepository ─────────────────────────────────────────────────

describe("InMemorySessionRepository", () => {
  it("given_sessions_for_different_agents__when_listByAgentId__then_returns_matching_only", async () => {
    const repo = new InMemorySessionRepository();
    await repo.create(SESSION);
    await repo.create({ ...SESSION, id: "session-2", agentId: "agent-2" });

    const sessions = await repo.listByAgentId("agent-1");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe("session-1");
  });
});

// ── InMemoryEventRepository ───────────────────────────────────────────────────

describe("InMemoryEventRepository", () => {
  it("given_an_event__when_appended__then_record_has_sequence_and_appendedAt", async () => {
    const repo = new InMemoryEventRepository();
    const record = await repo.append(EVENT);

    expect(record.sequence).toBe(1);
    expect(record.id).toBe("event-1");
    expect(typeof record.appendedAt).toBe("string");
  });

  it("given_duplicate_event_id__when_appended__then_rejects", async () => {
    const repo = new InMemoryEventRepository();
    await repo.append(EVENT);
    await expect(repo.append(EVENT)).rejects.toThrow("Event already exists: event-1");
  });

  it("given_an_event__when_getById_called__then_returns_the_record", async () => {
    const repo = new InMemoryEventRepository();
    await repo.append(EVENT);
    const record = await repo.getById("event-1");

    expect(record?.id).toBe("event-1");
  });

  it("given_missing_id__when_getById_called__then_returns_undefined", async () => {
    const repo = new InMemoryEventRepository();
    await expect(repo.getById("missing")).resolves.toBeUndefined();
  });

  it("given_events__when_listAfterSequence__then_returns_only_later_records", async () => {
    const repo = new InMemoryEventRepository();
    await repo.append(EVENT);
    await repo.append({ ...EVENT, id: "event-2" });
    await repo.append({ ...EVENT, id: "event-3" });

    const records = await repo.listAfterSequence(1);
    expect(records.map((r) => r.id)).toEqual(["event-2", "event-3"]);
  });

  it("given_events__when_listAfterSequence_with_limit__then_truncates", async () => {
    const repo = new InMemoryEventRepository();
    await repo.append(EVENT);
    await repo.append({ ...EVENT, id: "event-2" });
    await repo.append({ ...EVENT, id: "event-3" });

    const records = await repo.listAfterSequence(0, 2);
    expect(records).toHaveLength(2);
  });

  it("given_events__when_cleared__then_list_is_empty_and_sequence_resets", async () => {
    const repo = new InMemoryEventRepository();
    await repo.append(EVENT);
    repo.clear();

    const record = await repo.append({ ...EVENT, id: "event-fresh" });
    expect(record.sequence).toBe(1);
    await expect(repo.list()).resolves.toHaveLength(1);
  });
});

// ── InMemoryWebhookRepository ─────────────────────────────────────────────────

describe("InMemoryWebhookRepository", () => {
  it("given_webhooks_for_different_providers__when_listByProvider__then_returns_matching_only", async () => {
    const repo = new InMemoryWebhookRepository();
    await repo.create(WEBHOOK);
    await repo.create({ ...WEBHOOK, id: "webhook-2", provider: "gitlab" });

    const github = await repo.listByProvider("github");
    expect(github).toHaveLength(1);
    expect(github[0]!.id).toBe("webhook-1");
  });
});

// ── InMemoryModuleRegistryRepository ─────────────────────────────────────────

describe("InMemoryModuleRegistryRepository", () => {
  it("given_modules__when_findByName__then_returns_matching_records", async () => {
    const repo = new InMemoryModuleRegistryRepository();
    await repo.create(MODULE);
    await repo.create({ ...MODULE, id: "module-2", name: "sessions" });

    const found = await repo.findByName("agents");
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe("module-1");
  });
});

// ── InMemoryAuditEntryRepository ──────────────────────────────────────────────

describe("InMemoryAuditEntryRepository", () => {
  it("given_audit_entries_for_different_targets__when_listByTarget__then_returns_matching_only", async () => {
    const repo = new InMemoryAuditEntryRepository();
    await repo.create(AUDIT);
    await repo.create({ ...AUDIT, id: "audit-2", targetId: "agent-2" });

    const entries = await repo.listByTarget("agent-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe("audit-1");
  });
});

// ── InMemoryControlPlaneRepositories (integration) ───────────────────────────

describe("InMemoryControlPlaneRepositories", () => {
  it("given_agent_and_session_records__when_created__then_they_are_queryable_by_status_and_agent", async () => {
    const repositories = new InMemoryControlPlaneRepositories();

    await repositories.agents.create(AGENT);
    await repositories.sessions.create(SESSION);

    await expect(repositories.agents.listByStatus(AgentStatus.Running)).resolves.toHaveLength(1);
    await expect(repositories.sessions.listByAgentId("agent-1")).resolves.toHaveLength(1);
  });

  it("given_repositories__when_instantiated__then_all_sub_repositories_are_present", () => {
    const repos = new InMemoryControlPlaneRepositories();
    expect(repos.agents).toBeDefined();
    expect(repos.sessions).toBeDefined();
    expect(repos.events).toBeDefined();
    expect(repos.webhooks).toBeDefined();
    expect(repos.modules).toBeDefined();
    expect(repos.auditEntries).toBeDefined();
  });
});

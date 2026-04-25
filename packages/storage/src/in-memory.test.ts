import { describe, expect, it } from "vitest";

import { TICKET_PRIORITIES, TICKET_STATUSES, type TicketRecord } from "@control-plane/core";

import { InMemoryControlPlaneRepositories, InMemoryTicketRepository } from "./in-memory.js";
import { AgentStatus, SessionStatus } from "./models.js";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const UPDATED_AT = "2026-01-01T00:00:01.000Z";

describe("InMemoryControlPlaneRepositories", () => {
  it("given_agent_and_session_records__when_created__then_they_are_queryable_by_status_and_agent", async () => {
    const repositories = new InMemoryControlPlaneRepositories();

    await repositories.agents.create({
      id: "agent-1",
      name: "Builder",
      status: AgentStatus.Running,
      capabilities: ["session.streaming"],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
    await repositories.sessions.create({
      id: "session-1",
      agentId: "agent-1",
      status: SessionStatus.Active,
      startedAt: CREATED_AT,
    });

    await expect(repositories.agents.listByStatus(AgentStatus.Running)).resolves.toHaveLength(1);
    await expect(repositories.sessions.listByAgentId("agent-1")).resolves.toHaveLength(1);
  });

  it("includes a tickets repository", () => {
    const repos = new InMemoryControlPlaneRepositories();
    expect(repos.tickets).toBeDefined();
  });
});

describe("InMemoryTicketRepository", () => {
  it("creates a ticket with generated id and timestamps", async () => {
    const repo = new InMemoryTicketRepository();
    const ticket = await repo.create({ title: "Fix the bug" });

    expect(ticket.id).toBeTruthy();
    expect(ticket.title).toBe("Fix the bug");
    expect(ticket.status).toBe(TICKET_STATUSES.Open);
    expect(ticket.priority).toBe(TICKET_PRIORITIES.Normal);
    expect(ticket.createdAt).toBeTruthy();
    expect(ticket.updatedAt).toBeTruthy();
  });

  it("creates a ticket with all optional fields", async () => {
    const repo = new InMemoryTicketRepository();
    const ticket = await repo.create({
      title: "Investigate issue",
      description: "Something broke",
      priority: TICKET_PRIORITIES.High,
      assigneeAgentId: "agent-42",
    });

    expect(ticket.description).toBe("Something broke");
    expect(ticket.priority).toBe(TICKET_PRIORITIES.High);
    expect(ticket.assigneeAgentId).toBe("agent-42");
  });

  it("returns undefined for a missing ticket", async () => {
    const repo = new InMemoryTicketRepository();
    await expect(repo.getById("missing")).resolves.toBeUndefined();
  });

  it("retrieves a ticket by id", async () => {
    const repo = new InMemoryTicketRepository();
    const created = await repo.create({ title: "Test" });
    const found = await repo.getById(created.id);
    expect(found).toEqual(created);
  });

  it("lists all tickets", async () => {
    const repo = new InMemoryTicketRepository();
    await repo.create({ title: "T1" });
    await repo.create({ title: "T2" });
    const tickets = await repo.list();
    expect(tickets).toHaveLength(2);
  });

  it("updates a ticket and bumps updatedAt", async () => {
    const repo = new InMemoryTicketRepository();
    const original = await repo.create({ title: "T1" });
    const updated = await repo.update(original.id, { status: TICKET_STATUSES.InProgress });
    expect(updated.status).toBe(TICKET_STATUSES.InProgress);
    expect(updated.id).toBe(original.id);
  });

  it("throws when updating a non-existent ticket", async () => {
    const repo = new InMemoryTicketRepository();
    await expect(repo.update("ghost", { status: TICKET_STATUSES.Resolved })).rejects.toThrow(
      "ghost"
    );
  });

  it("deletes a ticket", async () => {
    const repo = new InMemoryTicketRepository();
    const ticket = await repo.create({ title: "Delete me" });
    const deleted = await repo.delete(ticket.id);
    expect(deleted).toBe(true);
    await expect(repo.getById(ticket.id)).resolves.toBeUndefined();
  });

  it("delete returns false for non-existent ticket", async () => {
    const repo = new InMemoryTicketRepository();
    await expect(repo.delete("ghost")).resolves.toBe(false);
  });

  it("listByStatus returns tickets matching the given status", async () => {
    const repo = new InMemoryTicketRepository();
    const t1 = await repo.create({ title: "Open one" });
    await repo.update(t1.id, { status: TICKET_STATUSES.InProgress });

    await repo.create({ title: "Another open" });

    const inProgress = await repo.listByStatus(TICKET_STATUSES.InProgress);
    const open = await repo.listByStatus(TICKET_STATUSES.Open);

    expect(inProgress).toHaveLength(1);
    expect(open).toHaveLength(1);
  });

  it("listByAgentId returns tickets assigned to the given agent", async () => {
    const repo = new InMemoryTicketRepository();
    await repo.create({ title: "For agent-1", assigneeAgentId: "agent-1" });
    await repo.create({ title: "For agent-2", assigneeAgentId: "agent-2" });
    await repo.create({ title: "Unassigned" });

    const forAgent1 = await repo.listByAgentId("agent-1");
    expect(forAgent1).toHaveLength(1);
    expect(forAgent1[0]?.assigneeAgentId).toBe("agent-1");
  });

  it("seed populates the store from external records", async () => {
    const repo = new InMemoryTicketRepository();
    const external: TicketRecord[] = [
      {
        id: "ext-1",
        title: "Seeded ticket",
        status: TICKET_STATUSES.Open,
        priority: TICKET_PRIORITIES.Normal,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ];
    repo.seed(external);
    await expect(repo.getById("ext-1")).resolves.toBeDefined();
    await expect(repo.list()).resolves.toHaveLength(1);
  });

  it("clear removes all tickets", async () => {
    const repo = new InMemoryTicketRepository();
    await repo.create({ title: "To be cleared" });
    repo.clear();
    await expect(repo.list()).resolves.toHaveLength(0);
  });
});

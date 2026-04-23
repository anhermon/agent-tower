import { describe, expect, it } from "vitest";
import { InMemoryControlPlaneRepositories } from "./in-memory.js";
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
      updatedAt: UPDATED_AT
    });
    await repositories.sessions.create({
      id: "session-1",
      agentId: "agent-1",
      status: SessionStatus.Active,
      startedAt: CREATED_AT
    });

    await expect(repositories.agents.listByStatus(AgentStatus.Running)).resolves.toHaveLength(1);
    await expect(repositories.sessions.listByAgentId("agent-1")).resolves.toHaveLength(1);
  });
});

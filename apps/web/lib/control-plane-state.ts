import { AGENT_STATUSES, type AgentStatus } from "@control-plane/core";
import { type AgentInventoryItem, listAgentsOrEmpty } from "@/lib/agents-source";
import { listSessionsOrEmpty } from "@/lib/sessions-source";
import { listSkillsOrEmpty } from "@/lib/skills-source";
import type { ActivityEvent, HealthState, Metric } from "@/types/control-plane";

/**
 * Em-dash placeholder used for metrics whose domain adapter hasn't been
 * implemented yet. Distinguishes "no adapter exists" from a real zero reported
 * by an adapter. Keep this symbol out of any metric whose source is wired.
 */
const UNIMPLEMENTED = "—";

export interface OverviewState {
  readonly metrics: readonly Metric[];
  readonly activity: readonly ActivityEvent[];
  readonly agents: readonly AgentInventoryItem[];
  readonly agentsAdapterConfigured: boolean;
  readonly agentsAdapterError: string | null;
}

export async function getOverviewState(now: Date = new Date()): Promise<OverviewState> {
  const [sessions, agents, skills] = await Promise.all([
    listSessionsOrEmpty(),
    listAgentsOrEmpty(now),
    listSkillsOrEmpty(),
  ]);

  const metrics: Metric[] = [
    {
      label: "Active sessions",
      value: sessions.ok ? formatActiveSessions(agents) : UNIMPLEMENTED,
      detail: sessions.ok
        ? describeActiveSessions(agents, sessions.sessions.length)
        : describeSessionsAdapter(sessions),
      trend: "flat",
    },
    {
      label: "Agent instances",
      value: agents.ok ? String(agents.agents.length) : UNIMPLEMENTED,
      detail: agents.ok ? describeAgents(agents.agents) : describeAgentsAdapter(agents),
      trend: "flat",
    },
    {
      label: "Skills",
      value: skills.ok ? String(skills.skills.length) : UNIMPLEMENTED,
      detail: skills.ok
        ? describeSkills(skills.skills.length, skills.roots.length)
        : describeSkillsAdapter(skills),
      trend: "flat",
    },
    {
      label: "Webhook deliveries",
      value: UNIMPLEMENTED,
      detail: "Webhooks module not yet implemented",
      trend: "flat",
    },
    {
      label: "Replay frames",
      value: UNIMPLEMENTED,
      detail: "Replay module not yet implemented",
      trend: "flat",
    },
  ];

  return {
    metrics,
    activity: [],
    agents: agents.ok ? agents.agents : [],
    agentsAdapterConfigured: agents.ok,
    agentsAdapterError:
      !agents.ok && agents.reason === "error" ? (agents.message ?? "Unknown error") : null,
  };
}

export function statusToHealthState(status: AgentStatus): HealthState {
  switch (status) {
    case AGENT_STATUSES.Available:
      return "healthy";
    case AGENT_STATUSES.Busy:
      return "degraded";
    case AGENT_STATUSES.Error:
      return "down";
    default:
      return "idle";
  }
}

function formatActiveSessions(agents: Awaited<ReturnType<typeof listAgentsOrEmpty>>): string {
  if (!agents.ok) return UNIMPLEMENTED;
  const active = agents.agents.reduce((sum, agent) => sum + agent.state.activeSessionIds.length, 0);
  return String(active);
}

function describeActiveSessions(
  agents: Awaited<ReturnType<typeof listAgentsOrEmpty>>,
  totalSessions: number
): string {
  if (!agents.ok) {
    return `${totalSessions} total on disk`;
  }
  return `${totalSessions} total on disk (active = modified in last hour)`;
}

function describeAgents(agents: readonly AgentInventoryItem[]): string {
  if (agents.length === 0) {
    return "No Claude Code projects found";
  }
  const available = agents.filter(
    (agent) => agent.state.status === AGENT_STATUSES.Available
  ).length;
  return `${available} available, ${agents.length - available} idle/offline`;
}

function describeSkills(count: number, roots: number): string {
  if (count === 0) {
    return "No SKILL.md files discovered";
  }
  return `Across ${roots} root${roots === 1 ? "" : "s"}`;
}

function describeSessionsAdapter(result: Awaited<ReturnType<typeof listSessionsOrEmpty>>): string {
  if (result.ok) return "";
  if (result.reason === "unconfigured") {
    return "Claude Code data root not configured";
  }
  return result.message ?? "Sessions adapter error";
}

function describeAgentsAdapter(result: Awaited<ReturnType<typeof listAgentsOrEmpty>>): string {
  if (result.ok) return "";
  if (result.reason === "unconfigured") {
    return "Claude Code data root not configured";
  }
  return result.message ?? "Agents adapter error";
}

function describeSkillsAdapter(result: Awaited<ReturnType<typeof listSkillsOrEmpty>>): string {
  if (result.ok) return "";
  if (result.reason === "unconfigured") {
    return "Skills root not configured";
  }
  return result.message ?? "Skills adapter error";
}

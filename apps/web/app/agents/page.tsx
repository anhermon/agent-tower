import { AGENT_STATUSES, type AgentStatus } from "@control-plane/core";

import { AgentGrid } from "@/components/agents/agent-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/state";
import {
  type AgentInventoryItem,
  type ListAgentsResult,
  listAgentsOrEmpty,
} from "@/lib/agents-source";
import { getModuleByKey } from "@/lib/modules";
import { CLAUDE_DATA_ROOT_ENV, getConfiguredDataRoot } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const mod = getModuleByKey("agents");
  const dataRoot = getConfiguredDataRoot();
  const result = await listAgentsOrEmpty();

  const status = dataRoot && result.ok ? "healthy" : "degraded";

  return (
    <section>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">{mod.label}</h1>
            <Badge state={status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Inventory of agent instances discovered from the configured Claude Code data root. Each
            project directory is one agent scoped to that cwd. State is derived from transcript
            activity — no heartbeats, no writes.
          </p>
          {dataRoot ? (
            <p className="mt-2 font-mono text-xs text-muted/80" title={dataRoot}>
              data root: {dataRoot}
            </p>
          ) : null}
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2">
          <Button>Refresh</Button>
        </div>
      </div>

      <AgentsBody result={result} />
    </section>
  );
}

function AgentsBody({ result }: { result: ListAgentsResult }) {
  if (!result.ok && result.reason === "unconfigured") {
    return (
      <EmptyState
        title="No agent runtimes"
        description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory to discover agent instances.`}
      />
    );
  }

  if (!result.ok) {
    return (
      <ErrorState
        title="Could not list agents"
        description={
          result.message ?? "An unknown error occurred reading the configured data root."
        }
      />
    );
  }

  if (result.agents.length === 0) {
    return (
      <EmptyState
        title="No agent runtimes"
        description="No agents discovered in the configured data root yet."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SummaryStrip agents={result.agents} />
      <AgentGrid agents={result.agents} />
    </div>
  );
}

function SummaryStrip({ agents }: { readonly agents: readonly AgentInventoryItem[] }) {
  const counts = countByStatus(agents);
  const items: readonly { readonly label: string; readonly value: number }[] = [
    { label: "Total agents", value: agents.length },
    { label: "Available", value: counts[AGENT_STATUSES.Available] },
    { label: "Busy", value: counts[AGENT_STATUSES.Busy] },
    { label: "Offline", value: counts[AGENT_STATUSES.Offline] },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-line bg-panel p-3 shadow-control">
          <dt className="text-xs uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function countByStatus(agents: readonly AgentInventoryItem[]): Record<AgentStatus, number> {
  const counts: Record<AgentStatus, number> = {
    [AGENT_STATUSES.Available]: 0,
    [AGENT_STATUSES.Busy]: 0,
    [AGENT_STATUSES.Offline]: 0,
    [AGENT_STATUSES.Error]: 0,
  };
  for (const agent of agents) {
    counts[agent.state.status] += 1;
  }
  return counts;
}

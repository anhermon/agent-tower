import { AGENT_STATUSES, type AgentStatus, listDetectedHarnesses } from "@control-plane/core";

import { AgentGrid } from "@/components/agents/agent-grid";
import { HarnessList } from "@/components/agents/harness-list";
import { Badge } from "@/components/ui/badge";
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
  const [result, harnesses] = await Promise.all([
    listAgentsOrEmpty(),
    listDetectedHarnesses().catch(() => []),
  ]);

  const status = dataRoot && result.ok ? "healthy" : "degraded";

  return (
    <section className="flex flex-col gap-8">
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

      <AgentsBody result={result} />

      <div>
        <h2 className="mb-3 text-base font-semibold text-ink">Detected Harnesses</h2>
        <p className="mb-3 max-w-3xl text-sm leading-6 text-muted">
          AI coding assistant runtimes found on this machine by scanning well-known local paths.
          Read-only — no configuration required.
        </p>
        <HarnessList harnesses={harnesses} />
      </div>
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

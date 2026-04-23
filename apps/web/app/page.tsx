import { PageHeader } from "@/components/layout/page-header";
import { LiveActivityPanel } from "@/components/sessions/live-activity-panel";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { getOverviewState, statusToHealthState } from "@/lib/control-plane-state";
import { getModuleByKey } from "@/lib/modules";

import type { AgentInventoryItem } from "@/lib/agents-source";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const overview = getModuleByKey("overview");
  const state = await getOverviewState();

  return (
    <section>
      <PageHeader module={overview} action="Refresh state" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {state.metrics.map((metric, index) => (
          <MetricCard key={metric.label} metric={metric} hero={index === 0} />
        ))}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <LiveActivityPanel />
        <AgentRuntimesPanel
          agents={state.agents}
          configured={state.agentsAdapterConfigured}
          error={state.agentsAdapterError}
        />
      </div>
      <div className="mt-5">
        <EmptyState
          title="No incidents"
          description="Incident records will appear after a storage-backed event source is connected."
        />
      </div>
    </section>
  );
}

function AgentRuntimesPanel({
  agents,
  configured,
  error,
}: {
  readonly agents: readonly AgentInventoryItem[];
  readonly configured: boolean;
  readonly error: string | null;
}) {
  return (
    <section className="glass-panel rounded-md">
      <div className="flex h-14 items-center justify-between border-b border-line/60 px-5">
        <div>
          <p className="eyebrow">Runtime</p>
          <h2 className="text-sm font-semibold text-ink">Agent runtimes</h2>
        </div>
        <span className="text-xs text-muted">
          {configured ? `${agents.length} discovered` : "Adapter not configured"}
        </span>
      </div>
      {renderAgentsBody(agents, configured, error)}
    </section>
  );
}

function renderAgentsBody(
  agents: readonly AgentInventoryItem[],
  configured: boolean,
  error: string | null
) {
  if (error) {
    return (
      <div className="p-5">
        <ErrorState title="Could not list agents" description={error} />
      </div>
    );
  }
  if (!configured) {
    return (
      <div className="p-5">
        <EmptyState
          title="No agent adapter configured"
          description="Set CLAUDE_CONTROL_PLANE_DATA_ROOT or create ~/.claude/projects to discover Claude Code agent instances."
        />
      </div>
    );
  }
  if (agents.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          title="No agent runtimes"
          description="No Claude Code projects discovered in the configured data root yet."
        />
      </div>
    );
  }
  return (
    <div className="divide-y divide-line/60">
      {agents.slice(0, 5).map((agent) => (
        <article className="px-5 py-4" key={agent.descriptor.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {agent.descriptor.displayName}
              </p>
              <p className="mt-1 text-xs text-muted">
                {agent.descriptor.runtime} · {agent.descriptor.kind}
              </p>
            </div>
            <Badge state={statusToHealthState(agent.state.status)} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="glass-panel-soft rounded-xs p-3">
              <p className="eyebrow">Sessions</p>
              <p className="mt-1 text-lg font-semibold text-ink">{agent.sessionCount}</p>
            </div>
            <div className="glass-panel-soft rounded-xs p-3">
              <p className="eyebrow">Active</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {agent.state.activeSessionIds.length}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

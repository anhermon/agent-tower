import Link from "next/link";
import { AgentSessionList } from "@/components/agents/agent-session-list";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { loadAgentOrUndefined } from "@/lib/agents-source";
import { formatBytes, formatRelative } from "@/lib/format";
import { CLAUDE_DATA_ROOT_ENV } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AgentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const decodedId = safeDecode(id);
  const result = await loadAgentOrUndefined(decodedId);

  if (!result.ok) {
    return (
      <section className="space-y-5">
        <Link href="/agents" className="text-sm text-accent hover:underline">
          ← Back to agents
        </Link>
        {result.reason === "unconfigured" ? (
          <EmptyState
            title="No agent runtimes"
            description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory to discover agent instances.`}
          />
        ) : result.reason === "not_found" ? (
          <EmptyState
            title="Agent not found"
            description={`No agent with id ${decodedId} was found under the configured data root.`}
          />
        ) : (
          <ErrorState
            title="Could not load agent"
            description={
              result.message ?? "An unknown error occurred reading the configured data root."
            }
          />
        )}
      </section>
    );
  }

  const { agent, sessions } = result;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/agents" className="text-cyan hover:underline">
          ← Back to agents
        </Link>
        <span className="font-mono text-xs text-muted" title={agent.descriptor.id}>
          {agent.descriptor.id}
        </span>
      </div>

      <header className="glass-panel accent-gradient-subtle relative overflow-hidden rounded-lg p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Agent</p>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-ink md:text-[28px]">
              {agent.descriptor.displayName}
            </h1>
            <p className="mt-2 break-all font-mono text-xs text-muted">{agent.projectId}</p>
          </div>
          <AgentStatusBadge status={agent.state.status} />
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Runtime" value={agent.descriptor.runtime} />
          <Stat label="Kind" value={agent.descriptor.kind} />
          <Stat label="Sessions" value={String(agent.sessionCount)} />
          <Stat label="Transcript size" value={formatBytes(agent.totalBytes)} />
          <Stat
            label="Last active"
            value={agent.lastActiveAt ? formatRelative(agent.lastActiveAt) : "—"}
            hint={agent.lastActiveAt ?? undefined}
          />
          <Stat
            label="First seen"
            value={agent.firstSeenAt ? formatRelative(agent.firstSeenAt) : "—"}
            hint={agent.firstSeenAt ?? undefined}
          />
          <Stat
            label="Active sessions"
            value={String(agent.state.activeSessionIds.length)}
            hint="active in the last hour"
          />
          <Stat label="Agent id" value={agent.descriptor.id} mono wide />
        </dl>

        <div className="relative mt-5 flex flex-wrap gap-2">
          {agent.descriptor.capabilities.map((capability) => (
            <span
              key={capability}
              className="inline-flex items-center rounded-full border border-line/80 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-muted"
            >
              {capability}
            </span>
          ))}
        </div>
      </header>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="eyebrow">Drill-down</p>
            <h2 className="text-base font-semibold text-ink">Sessions</h2>
          </div>
          <p className="text-xs text-muted">
            Links resolve into the Sessions module for transcript drill-down.
          </p>
        </div>
        <AgentSessionList sessions={sessions} />
      </div>
    </section>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function Stat({
  label,
  value,
  hint,
  mono,
  wide,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly mono?: boolean;
  readonly wide?: boolean;
}) {
  return (
    <div className={`glass-panel-soft rounded-xs p-3 ${wide ? "col-span-2 md:col-span-4" : ""}`}>
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 text-sm text-ink ${mono ? "break-all font-mono text-xs" : ""}`}>
        {value}
        {hint ? <span className="ml-2 font-mono text-xs text-muted/80">{hint}</span> : null}
      </dd>
    </div>
  );
}

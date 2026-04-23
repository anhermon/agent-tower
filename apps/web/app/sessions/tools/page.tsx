import { ToolRankingChart } from "@/components/sessions/charts/_lazy";
import { BranchLeaderboard } from "@/components/sessions/charts/branch-leaderboard";
import { FeatureAdoptionTable } from "@/components/sessions/charts/feature-adoption-table";
import { McpServerPanel } from "@/components/sessions/charts/mcp-server-panel";
import { VersionHistoryTable } from "@/components/sessions/charts/version-history-table";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { getOverview, getToolAnalytics } from "@/lib/sessions-analytics";
import { CLAUDE_DATA_ROOT_ENV } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

export default async function SessionsToolsPage() {
  const [toolsResult, overview] = await Promise.all([getToolAnalytics(), getOverview()]);

  if (toolsResult.ok === false && toolsResult.reason === "unconfigured") {
    return (
      <section>
        <PageHeader title="Tools & Features" />
        <EmptyState
          title="No analytics source configured"
          description={`Set ${CLAUDE_DATA_ROOT_ENV} to your Claude Code projects directory to populate tool analytics.`}
        />
      </section>
    );
  }
  if (toolsResult.ok === false) {
    return (
      <section>
        <PageHeader title="Tools & Features" />
        <ErrorState
          title="Could not compute tool analytics"
          description={
            toolsResult.reason === "error"
              ? toolsResult.message
              : "Analytics source not configured."
          }
        />
      </section>
    );
  }
  const value = toolsResult.value;
  const sessionCount = overview.ok ? overview.value.sessionCount : 0;

  const uniqueTools = value.tools.length;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Tools & Features"
        subtitle="Every tool call, MCP server, and feature surfaced from local transcripts."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Tool calls"
          value={value.totalToolCalls.toLocaleString()}
          detail="total all time"
          color="#d97706"
        />
        <StatTile
          label="Unique tools"
          value={uniqueTools.toLocaleString()}
          detail="distinct tools used"
          color="rgb(var(--color-ink))"
        />
        <StatTile
          label="MCP servers"
          value={value.mcpServers.length.toLocaleString()}
          detail="connected servers"
          color="#34d399"
        />
        <StatTile
          label="Errors"
          value={value.totalErrors.toLocaleString()}
          detail={
            value.totalToolCalls > 0
              ? `${((value.totalErrors / value.totalToolCalls) * 100).toFixed(2)}% error rate`
              : "no errors"
          }
          color={value.totalErrors > 0 ? "#f87171" : "rgb(var(--color-muted))"}
        />
      </div>

      <Card title="Tool ranking" description="All tools ranked by total calls">
        <ToolRankingChart tools={value.tools} />
      </Card>

      {value.mcpServers.length > 0 ? (
        <Card title="MCP server details" description="Connected MCP servers and their tools">
          <McpServerPanel servers={value.mcpServers} />
        </Card>
      ) : null}

      <Card
        title="Feature adoption"
        description="How often advanced features are used across sessions"
      >
        <FeatureAdoptionTable adoption={value.featureAdoption} totalSessions={sessionCount} />
      </Card>

      {value.versions.length > 0 ? (
        <Card
          title="Claude Code version history"
          description="Versions observed across your sessions"
        >
          <VersionHistoryTable versions={value.versions} />
        </Card>
      ) : null}

      {value.branches.length > 0 ? (
        <Card title="Git branch analytics" description="Most active branches by turn count">
          <BranchLeaderboard branches={value.branches} />
        </Card>
      ) : null}
    </section>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
    </header>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="glass-panel rounded-md p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </header>
      {children}
    </article>
  );
}

function StatTile({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <article className="glass-panel flex min-h-24 flex-col justify-between rounded-md p-4">
      <p className="eyebrow">{label}</p>
      <p className="font-mono text-2xl font-semibold tabular-nums leading-none" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-muted">{detail}</p>
    </article>
  );
}

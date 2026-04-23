import {
  ModelBreakdownDonut,
  PeakHoursChart,
  ProjectActivityDonut,
  UsageOverTimeChart,
} from "@/components/sessions/charts/_lazy";
import { Sparkline } from "@/components/sessions/charts/sparkline";
import { TokenBreakdownBars } from "@/components/sessions/charts/token-breakdown-bars";
import { resolveRangeFromSearchParams } from "@/components/sessions/date-range";
import { DateRangePicker } from "@/components/sessions/date-range-picker";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { formatCost, formatTokens } from "@/lib/format";
import { getCostBreakdown, getOverview, listProjects, type Result } from "@/lib/sessions-analytics";
import { CLAUDE_DATA_ROOT_ENV } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SessionsOverviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const range = resolveRangeFromSearchParams(sp);

  const [overview, costs, projectsResult] = await Promise.all([
    getOverview(range),
    getCostBreakdown(range),
    listProjects(),
  ]);

  const unconfigured =
    (overview.ok === false && overview.reason === "unconfigured") ||
    (costs.ok === false && costs.reason === "unconfigured");
  if (unconfigured) {
    return (
      <section>
        <PageHeader
          title="Overview"
          subtitle="Aggregate activity across your Claude Code transcripts."
        />
        <EmptyState
          title="No analytics source configured"
          description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory to populate this dashboard.`}
        />
      </section>
    );
  }

  if (overview.ok === false) {
    return (
      <section>
        <PageHeader title="Overview" />
        <ErrorState
          title="Could not compute overview"
          description={
            overview.reason === "error" ? overview.message : "Analytics source not configured."
          }
        />
      </section>
    );
  }
  if (costs.ok === false) {
    return (
      <section>
        <PageHeader title="Overview" />
        <ErrorState
          title="Could not compute cost breakdown"
          description={
            costs.reason === "error" ? costs.message : "Analytics source not configured."
          }
        />
      </section>
    );
  }

  const projects = projectsResult.ok ? projectsResult.value : [];
  const { value } = overview;
  const { value: costBreakdown } = costs;

  const sessionSpark = value.timeseries.daily.slice(-14).map((d) => d.sessionCount);
  const msgSpark = value.timeseries.daily.slice(-14).map((d) => d.messageCount);
  const costSpark = value.timeseries.daily.slice(-14).map((d) => d.estimatedCostUsd);
  // The timeseries fold does not yet carry per-day token counts, so we cannot
  // plot a truthful per-day token sparkline. Leaving empty renders nothing
  // instead of a misleading flat aggregate line.
  const tokenSpark: readonly number[] = [];

  const messageTotal = value.messageCount;
  const sessionCount = value.sessionCount;
  const totalTokens =
    value.totalInputTokens +
    value.totalOutputTokens +
    value.totalCacheReadTokens +
    value.totalCacheCreationTokens;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle={`${projects.length.toLocaleString()} projects · ${sessionCount.toLocaleString()} sessions aggregated`}
        trailing={<DateRangePicker />}
      />

      {/* Hero stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sessions"
          value={sessionCount.toLocaleString()}
          detail={range ? "in selected range" : "all time"}
          spark={sessionSpark}
          color="rgb(143 124 255)"
          ariaLabel="Session count sparkline"
        />
        <StatCard
          label="Messages"
          value={messageTotal.toLocaleString()}
          detail={`${value.toolCallCount.toLocaleString()} tool calls`}
          spark={msgSpark}
          color="#d97706"
          ariaLabel="Message count sparkline"
        />
        <StatCard
          label="Tokens used"
          value={formatTokens(totalTokens)}
          detail={`${formatTokens(value.totalCacheReadTokens)} from cache`}
          spark={tokenSpark}
          color="#60a5fa"
          ariaLabel="Token total sparkline"
        />
        <StatCard
          label="Estimated cost"
          value={formatCost(value.estimatedCostUsd)}
          detail={`${formatCost(costBreakdown.overallCacheEfficiency.savedUsd)} saved via cache`}
          spark={costSpark}
          color="#34d399"
          ariaLabel="Cost sparkline"
        />
      </div>

      {/* Usage over time + Model distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Card
          title="Usage over time"
          description={`Messages and sessions across ${value.timeseries.daily.length} days`}
        >
          <UsageOverTimeChart data={value.timeseries.daily} />
        </Card>
        <Card title="Model distribution" description="Token usage by model">
          <ModelBreakdownDonut models={costBreakdown.byModel} />
        </Card>
      </div>

      {/* Peak hours + Project activity */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Peak hours" description="Activity by hour of day (UTC)">
          <PeakHoursChart data={value.timeseries.peakHours} />
        </Card>
        <Card title="Project activity" description="Top projects by token usage">
          <ProjectActivityDonut projects={projects} />
        </Card>
      </div>

      {/* Token breakdown */}
      <Card
        title="Token breakdown"
        description={`Distribution across token types (${range ? "in selected range" : "all time"})`}
      >
        <TokenBreakdownBars
          inputTokens={value.totalInputTokens}
          outputTokens={value.totalOutputTokens}
          cacheReadTokens={value.totalCacheReadTokens}
          cacheCreationTokens={value.totalCacheCreationTokens}
        />
      </Card>
    </section>
  );
}

function PageHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="mb-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {trailing}
    </header>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
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

function StatCard({
  label,
  value,
  detail,
  spark,
  color,
  ariaLabel,
}: {
  label: string;
  value: string;
  detail: string;
  spark: readonly number[];
  color: string;
  ariaLabel: string;
}) {
  return (
    <article className="glass-panel flex min-h-32 flex-col justify-between gap-3 rounded-md p-5">
      <p className="eyebrow">{label}</p>
      <p className="font-mono text-[28px] font-semibold tabular-nums leading-none text-ink">
        {value}
      </p>
      <p className="text-xs text-muted">{detail}</p>
      <Sparkline data={spark} color={color} height={36} ariaLabel={ariaLabel} />
    </article>
  );
}

// keep the result type from being unused when consumers don't need it
export type { Result };

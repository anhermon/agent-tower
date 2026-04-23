import {
  DayOfWeekChart,
  PeakHoursChart,
  UsageOverTimeChart,
} from "@/components/sessions/charts/_lazy";
import { ActivityHeatmap } from "@/components/sessions/charts/activity-heatmap";
import { BranchLeaderboard } from "@/components/sessions/charts/branch-leaderboard";
import { StreakCard } from "@/components/sessions/charts/streak-card";
import { resolveRangeFromSearchParams } from "@/components/sessions/date-range";
import { DateRangePicker } from "@/components/sessions/date-range-picker";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { getActivity, getToolAnalytics } from "@/lib/sessions-analytics";
import { CLAUDE_DATA_ROOT_ENV } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SessionsActivityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const range = resolveRangeFromSearchParams(sp);
  const [activity, tools] = await Promise.all([getActivity(range), getToolAnalytics()]);

  if (activity.ok === false && activity.reason === "unconfigured") {
    return (
      <section>
        <PageHeader title="Activity" />
        <EmptyState
          title="No analytics source configured"
          description={`Set ${CLAUDE_DATA_ROOT_ENV} to your Claude Code projects directory to populate activity charts.`}
        />
      </section>
    );
  }
  if (activity.ok === false) {
    return (
      <section>
        <PageHeader title="Activity" />
        <ErrorState
          title="Could not compute activity"
          description={
            activity.reason === "error" ? activity.message : "Analytics source not configured."
          }
        />
      </section>
    );
  }

  const ts = activity.value;
  const activeDays = ts.daily.filter((d) => d.messageCount > 0).length;
  const branches = tools.ok ? tools.value.branches : [];

  return (
    <section className="space-y-6">
      <PageHeader
        title="Activity"
        subtitle="Streaks, peak hours, and day-of-week patterns from local transcripts."
        trailing={<DateRangePicker />}
      />

      <StreakCard streaks={ts.streaks} totalActiveDays={activeDays} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Activity calendar" description="GitHub-style 53-week contribution heatmap">
          <ActivityHeatmap data={ts.daily} />
        </Card>
        <Card title="Peak hours" description="Activity by hour of day">
          <PeakHoursChart data={ts.peakHours} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Usage over time" description={`${ts.daily.length} days shown`}>
          <UsageOverTimeChart data={ts.daily} />
        </Card>
        <Card title="Day of week" description="Which days you ship the most">
          <DayOfWeekChart data={ts.dayOfWeek} />
        </Card>
      </div>

      {branches.length > 0 ? (
        <Card title="Git branches" description="Most active branches by turn count">
          <BranchLeaderboard branches={branches} />
        </Card>
      ) : null}
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

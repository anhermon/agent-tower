import { PRICING } from "@control-plane/core";
import { CacheEfficiencyPanel } from "@/components/sessions/charts/cache-efficiency-panel";
import { CostByProjectChart } from "@/components/sessions/charts/cost-by-project-chart";
import { CostOverTimeChart } from "@/components/sessions/charts/cost-over-time-chart";
import { ModelTokenTable } from "@/components/sessions/charts/model-token-table";
import { resolveRangeFromSearchParams } from "@/components/sessions/date-range";
import { DateRangePicker } from "@/components/sessions/date-range-picker";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { formatCost } from "@/lib/format";
import { getCostBreakdown } from "@/lib/sessions-analytics";
import { CLAUDE_DATA_ROOT_ENV } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SessionsCostsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const range = resolveRangeFromSearchParams(sp);
  const costs = await getCostBreakdown(range);

  if (costs.ok === false && costs.reason === "unconfigured") {
    return (
      <section>
        <PageHeader
          title="Costs"
          subtitle="Estimated spend derived from local Claude Code transcripts."
        />
        <EmptyState
          title="No analytics source configured"
          description={`Set ${CLAUDE_DATA_ROOT_ENV} to your Claude Code projects directory to populate costs.`}
        />
      </section>
    );
  }

  if (costs.ok === false) {
    return (
      <section>
        <PageHeader title="Costs" />
        <ErrorState
          title="Could not compute cost breakdown"
          description={
            costs.reason === "error" ? costs.message : "Analytics source not configured."
          }
        />
      </section>
    );
  }

  const { value } = costs;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Costs"
        subtitle="Estimated spend from local Claude Code transcripts. Pricing is point-in-time; see reference below."
        trailing={<DateRangePicker />}
      />

      {/* Hero stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Total estimated cost"
          value={formatCost(value.totalUsd)}
          detail="all models, range applied"
          color="#d97706"
        />
        <StatTile
          label="Cache savings"
          value={formatCost(value.overallCacheEfficiency.savedUsd)}
          detail={`${(value.overallCacheEfficiency.hitRate * 100).toFixed(1)}% hit rate`}
          color="#34d399"
        />
        <StatTile
          label="Without cache"
          value={formatCost(value.overallCacheEfficiency.wouldHavePaidUsd)}
          detail="what you would have spent"
          color="#f87171"
        />
      </div>

      {value.daily.length > 0 ? (
        <Card title="Cost over time" description="Daily estimated spend, stacked by model">
          <CostOverTimeChart daily={value.daily} />
        </Card>
      ) : (
        <Card title="Cost over time" description="No cost data in the selected range">
          <div className="flex h-36 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted">
            No data in range
          </div>
        </Card>
      )}

      {value.byProject.length > 0 ? (
        <Card title="Cost by project" description="Top 12 projects by estimated cost">
          <CostByProjectChart projects={value.byProject} />
        </Card>
      ) : null}

      <Card title="Per-model token breakdown" description="Token usage and cost by model">
        <ModelTokenTable models={value.byModel} />
      </Card>

      <Card title="Cache efficiency" description="Savings attributable to prompt caching">
        <CacheEfficiencyPanel
          models={value.byModel}
          overall={value.overallCacheEfficiency}
          totalCostUsd={value.totalUsd}
        />
      </Card>

      <Card
        title="Pricing reference"
        description={
          <>
            Estimates only — adjust rates in{" "}
            <code className="rounded bg-soft px-1 py-0.5 text-[11px] text-ink">
              packages/core/src/lib/pricing.ts
            </code>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] font-mono">
            <thead>
              <tr className="border-b border-line/70">
                <th scope="col" className="eyebrow py-2 text-left">
                  Model
                </th>
                <th scope="col" className="eyebrow py-2 text-right">
                  Input /MTok
                </th>
                <th scope="col" className="eyebrow py-2 text-right">
                  Output /MTok
                </th>
                <th scope="col" className="eyebrow py-2 text-right">
                  Cache Write /MTok
                </th>
                <th scope="col" className="eyebrow py-2 text-right">
                  Cache Read /MTok
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(PRICING).map(([model, p]) => (
                <tr key={model} className="border-b border-line/30 hover:bg-soft/30">
                  <td className="py-2 text-ink/80">{model}</td>
                  <td className="py-2 text-right text-info">${(p.input * 1_000_000).toFixed(2)}</td>
                  <td className="py-2 text-right" style={{ color: "#d97706" }}>
                    ${(p.output * 1_000_000).toFixed(2)}
                  </td>
                  <td className="py-2 text-right" style={{ color: "#a78bfa" }}>
                    ${(p.cacheWrite * 1_000_000).toFixed(2)}
                  </td>
                  <td className="py-2 text-right text-ok">
                    ${(p.cacheRead * 1_000_000).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <article className="glass-panel flex min-h-28 flex-col justify-between rounded-md p-5">
      <p className="eyebrow">{label}</p>
      <p
        className="font-mono text-[28px] font-semibold tabular-nums leading-none"
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-xs text-muted">{detail}</p>
    </article>
  );
}

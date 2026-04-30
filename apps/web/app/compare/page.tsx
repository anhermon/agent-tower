import type {
  FeatureMatrix,
  HarnessMetrics,
  ModelMetrics,
} from "@control-plane/adapter-claude-code";

import { EmptyState, ErrorState } from "@/components/ui/state";
import { getCompareData } from "@/lib/compare-source";
import { formatCost } from "@/lib/format";
import { CLAUDE_DATA_ROOT_ENV } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const result = await getCompareData();

  if (result.ok === false && result.reason === "unconfigured") {
    return (
      <section>
        <PageHeader
          title="Compare"
          subtitle="Cross-harness analytics and model efficiency comparison."
        />
        <EmptyState
          title="No analytics source configured"
          description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory to populate this view.`}
        />
      </section>
    );
  }

  if (result.ok === false) {
    return (
      <section>
        <PageHeader title="Compare" />
        <ErrorState
          title="Could not load comparison data"
          description={result.reason === "error" ? result.message : "Unexpected error."}
        />
      </section>
    );
  }

  const { models, harnesses, featureMatrix, sessionCount } = result.value;

  if (sessionCount === 0) {
    return (
      <section>
        <PageHeader title="Compare" subtitle="No sessions to compare yet." />
        <EmptyState
          title="No sessions found"
          description="Run some sessions with Claude Code to populate the comparison view."
        />
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <PageHeader
        title="Compare"
        subtitle={`${sessionCount.toLocaleString()} sessions · ${models.length} models · ${harnesses.length} harnesses`}
      />

      <Card
        title="Model performance leaderboard"
        description="Sessions aggregated by model — sorted by total cost"
      >
        <ModelTable models={models} />
      </Card>

      <Card
        title="Harness efficiency leaderboard"
        description="Sessions grouped by model family — sorted by cache efficiency"
      >
        <HarnessTable harnesses={harnesses} />
      </Card>

      <Card
        title="Feature compatibility matrix"
        description="Fraction of sessions using each optimisation feature per harness"
      >
        <FeatureMatrixTable matrix={featureMatrix} />
      </Card>
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-2">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
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

function ModelTable({ models }: { models: readonly ModelMetrics[] }) {
  if (models.length === 0) {
    return <p className="text-sm text-muted">No model data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="pb-2 pr-4 font-medium">Model</th>
            <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
            <th className="pb-2 pr-4 text-right font-medium">Cost / session</th>
            <th className="pb-2 pr-4 text-right font-medium">Cache hit %</th>
            <th className="pb-2 pr-4 text-right font-medium">Median tok / turn</th>
            <th className="pb-2 pr-4 text-right font-medium">p95 tok / turn</th>
            <th className="pb-2 text-right font-medium">Avg waste</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model} className="border-b border-line/50 last:border-0">
              <td className="py-2 pr-4 font-mono text-xs text-ink">{m.model}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted">
                {m.sessionCount.toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-ink">
                {formatCost(m.costPerSession)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-ink">{pct(m.cacheHitRate)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted">
                {Math.round(m.medianTokensPerTurn).toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted">
                {Math.round(m.p95TokensPerTurn).toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums">
                <WasteBadge score={m.avgWasteScore} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HarnessTable({ harnesses }: { harnesses: readonly HarnessMetrics[] }) {
  if (harnesses.length === 0) {
    return <p className="text-sm text-muted">No harness data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="pb-2 pr-4 font-medium">Harness</th>
            <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
            <th className="pb-2 pr-4 text-right font-medium">Total cost</th>
            <th className="pb-2 pr-4 text-right font-medium">Median cost</th>
            <th className="pb-2 pr-4 text-right font-medium">Cache eff %</th>
            <th className="pb-2 pr-4 text-right font-medium">Waste rate</th>
            <th className="pb-2 text-right font-medium">µ$ / out-tok</th>
          </tr>
        </thead>
        <tbody>
          {harnesses.map((h) => (
            <tr key={h.harness} className="border-b border-line/50 last:border-0">
              <td className="py-2 pr-4 font-mono text-xs text-ink">{h.harness}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted">
                {h.sessionCount.toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-ink">
                {formatCost(h.totalCostUsd)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-ink">
                {formatCost(h.medianCostPerSession)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-ink">
                {pct(h.cacheEfficiency)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                <WasteBadge score={h.wasteRate} />
              </td>
              <td className="py-2 text-right tabular-nums text-muted">
                {(h.costPerOutputToken * 1_000_000).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureMatrixTable({ matrix }: { matrix: FeatureMatrix }) {
  if (matrix.harnesses.length === 0) {
    return <p className="text-sm text-muted">No feature data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="pb-2 pr-4 font-medium">Feature</th>
            {matrix.harnesses.map((h) => (
              <th key={h} className="pb-2 pr-4 text-right font-medium font-mono">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.feature} className="border-b border-line/50 last:border-0">
              <td className="py-2 pr-4 text-xs text-ink">{row.feature}</td>
              {matrix.harnesses.map((h) => {
                const cell = row.byHarness[h];
                return (
                  <td key={h} className="py-2 pr-4 text-right tabular-nums text-xs">
                    {cell ? (
                      <UsageBar rate={cell.usageRate} />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function WasteBadge({ score }: { score: number }) {
  const color = score < 0.2 ? "text-green-500" : score < 0.5 ? "text-yellow-500" : "text-red-500";
  return <span className={`font-mono ${color}`}>{score.toFixed(3)}</span>;
}

function UsageBar({ rate }: { rate: number }) {
  const width = Math.round(rate * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-16 rounded-full bg-line/50">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${width}%` }}
          aria-hidden="true"
        />
      </span>
      <span className="tabular-nums text-muted">{pct(rate)}</span>
    </span>
  );
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

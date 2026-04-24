"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { CacheEfficiency, ModelCostBreakdown } from "@control-plane/core";

import { formatCost, formatPercent, formatTokens } from "@/lib/format";

interface Props {
  readonly models: readonly ModelCostBreakdown[];
  readonly overall: CacheEfficiency;
  readonly totalCostUsd: number;
}

export function CacheEfficiencyPanel({ models, overall, totalCostUsd }: Props) {
  const totalCacheRead = models.reduce((s, m) => s + m.usage.cacheReadInputTokens, 0);
  const totalInput = models.reduce((s, m) => s + m.usage.inputTokens, 0);

  if (totalCacheRead + totalInput === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted">
        No cache usage yet
      </div>
    );
  }

  const pieData = [
    { name: "Cache Read", value: totalCacheRead, color: "#34d399" },
    { name: "Direct Input", value: totalInput, color: "#60a5fa" },
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_160px]">
      <div className="space-y-2 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="text-muted">Cache hit rate</span>
          <span className="text-lg font-bold text-ok">{formatPercent(overall.hitRate)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Context from cache</span>
          <span className="font-mono text-ink">{formatTokens(totalCacheRead)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Context from input</span>
          <span className="font-mono text-ink">{formatTokens(totalInput)}</span>
        </div>
        <div className="mt-2 space-y-1.5 border-t border-line/50 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-muted">Without cache</span>
            <span className="font-mono text-danger">{formatCost(overall.wouldHavePaidUsd)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">You paid</span>
            <span className="font-mono text-ink">{formatCost(totalCostUsd)}</span>
          </div>
          <div className="flex items-center justify-between font-bold">
            <span className="text-ok">Savings</span>
            <span className="font-mono text-ok">{formatCost(overall.savedUsd)}</span>
          </div>
        </div>
      </div>
      <div role="img" aria-label="Cache versus input split">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={60}
              dataKey="value"
              strokeWidth={0}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} aria-label={entry.name} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "rgb(var(--color-panel))",
                border: "1px solid rgb(var(--color-line))",
                borderRadius: 4,
                fontSize: 12,
              }}
              formatter={
                ((val: unknown, name: unknown) => [
                  formatTokens(Number(val ?? 0)),
                  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Recharts passes `name` as unknown; safe to stringify
                  String(name ?? ""),
                ]) as never
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

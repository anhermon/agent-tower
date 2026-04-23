"use client";

import type { ModelCostBreakdown } from "@control-plane/core";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatTokens } from "@/lib/format";
import type { ChartTooltipProps } from "./_types";

interface Props {
  readonly models: readonly ModelCostBreakdown[];
}

const COLORS = ["#d97706", "#34d399", "#2563eb", "#a78bfa", "#fbbf24", "#ea580c", "#64748b"];

function shortModel(model: string): string {
  if (model.includes("opus-4-6")) return "Opus 4.6";
  if (model.includes("opus-4-5")) return "Opus 4.5";
  if (model.includes("opus-4-7")) return "Opus 4.7";
  if (model.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (model.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (model.includes("haiku-4-5")) return "Haiku 4.5";
  if (model.includes("haiku-4-6")) return "Haiku 4.6";
  const parts = model.split("-");
  return parts.slice(0, 3).join("-");
}

function CustomTooltip({ active, payload }: ChartTooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const name = entry?.name ?? "";
  const value = typeof entry?.value === "number" ? entry.value : 0;
  return (
    <div className="rounded-sm border border-line/70 bg-panel/95 px-3 py-2 text-xs shadow-glass">
      <p className="text-muted">{name}</p>
      <p className="font-semibold text-ink">{formatTokens(value)} tokens</p>
    </div>
  );
}

export function ModelBreakdownDonut({ models }: Props) {
  const data = models
    .map((m) => ({
      name: shortModel(m.model),
      value:
        (m.usage.inputTokens ?? 0) +
        (m.usage.outputTokens ?? 0) +
        (m.usage.cacheReadInputTokens ?? 0) +
        (m.usage.cacheCreationInputTokens ?? 0),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label="Model distribution — no data"
        className="flex h-52 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No model data
      </div>
    );
  }

  return (
    <div role="img" aria-label="Model distribution donut chart" className="w-full">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={COLORS[i % COLORS.length]} aria-label={entry.name} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v) => <span style={{ color: "rgb(var(--color-muted))" }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

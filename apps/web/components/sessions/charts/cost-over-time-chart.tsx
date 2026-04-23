"use client";

import type { DailyCostPoint } from "@control-plane/core";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCost } from "@/lib/format";

interface Props {
  readonly daily: readonly DailyCostPoint[];
}

const MODEL_COLORS: Record<string, string> = {
  "opus-4-6": "#d97706",
  "opus-4-5": "#a78bfa",
  "opus-4-7": "#f97316",
  "sonnet-4-6": "#60a5fa",
  "sonnet-4-5": "#2563eb",
  "haiku-4-5": "#34d399",
  "haiku-4-6": "#10b981",
};

function colorForModel(m: string): string {
  for (const [key, col] of Object.entries(MODEL_COLORS)) if (m.includes(key)) return col;
  return "#7a8494";
}

function shortModel(m: string): string {
  if (m.includes("opus-4-7")) return "Opus 4.7";
  if (m.includes("opus-4-6")) return "Opus 4.6";
  if (m.includes("opus-4-5")) return "Opus 4.5";
  if (m.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (m.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (m.includes("haiku-4-5")) return "Haiku 4.5";
  if (m.includes("haiku-4-6")) return "Haiku 4.6";
  return m;
}

export function CostOverTimeChart({ daily }: Props) {
  const { rows, models } = useMemo(() => {
    const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
    const modelSet = new Set<string>();
    for (const d of sorted) {
      for (const m of Object.keys(d.byModel)) modelSet.add(m);
    }
    const models = [...modelSet];
    const rows = sorted.map((d) => ({
      date: d.date.slice(5),
      ...Object.fromEntries(models.map((m) => [m, d.byModel[m] ?? 0])),
      total: d.totalUsd,
    }));
    return { rows, models };
  }, [daily]);

  if (rows.length === 0) {
    return (
      <div
        role="img"
        aria-label="Cost over time — no data"
        className="flex h-52 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No cost data in range
      </div>
    );
  }

  return (
    <div role="img" aria-label="Cost over time stacked area chart" className="w-full">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
            width={52}
          />
          <Tooltip
            contentStyle={{
              background: "rgb(var(--color-panel))",
              border: "1px solid rgb(var(--color-line))",
              borderRadius: 4,
              fontSize: 12,
            }}
            formatter={
              ((val: unknown, name: unknown) => [
                formatCost(Number(val ?? 0)),
                shortModel(String(name ?? "")),
              ]) as never
            }
          />
          {models.map((m) => (
            <Area
              key={m}
              type="monotone"
              dataKey={m}
              stackId="1"
              stroke={colorForModel(m)}
              fill={`${colorForModel(m)}30`}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import type { ProjectCostRow } from "@control-plane/core";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCost } from "@/lib/format";

interface Props {
  readonly projects: readonly ProjectCostRow[];
}

export function CostByProjectChart({ projects }: Props) {
  const top = [...projects].sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd).slice(0, 12);

  if (top.length === 0) {
    return (
      <div
        role="img"
        aria-label="Cost by project — no data"
        className="flex h-40 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No project cost data
      </div>
    );
  }

  return (
    <div role="img" aria-label="Cost by project bar chart" className="w-full">
      <ResponsiveContainer width="100%" height={Math.max(140, top.length * 30)}>
        <BarChart
          data={top.map((p) => ({
            displayName: p.displayName || p.projectId,
            cost: p.estimatedCostUsd,
          }))}
          layout="vertical"
          margin={{ top: 0, right: 56, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
          />
          <YAxis
            type="category"
            dataKey="displayName"
            tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            width={120}
          />
          <Tooltip
            contentStyle={{
              background: "rgb(var(--color-panel))",
              border: "1px solid rgb(var(--color-line))",
              borderRadius: 4,
              fontSize: 12,
            }}
            formatter={
              ((val: unknown) => [formatCost(Number(val ?? 0)), "Estimated cost"]) as never
            }
          />
          <Bar dataKey="cost" radius={[0, 3, 3, 0]}>
            {top.map((_, i) => (
              <Cell key={i} fill={`rgba(217,119,6,${Math.max(0.35, 1 - i * 0.06)})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

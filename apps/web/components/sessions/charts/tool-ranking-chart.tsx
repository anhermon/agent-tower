"use client";

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

import type { ToolSummary } from "@control-plane/core";

import type { TooltipPayloadEntry } from "./_types";

interface Props {
  readonly tools: readonly ToolSummary[];
}

const CATEGORY_COLORS: Record<string, string> = {
  "file-read": "#60a5fa",
  "file-write": "#a78bfa",
  search: "#34d399",
  execution: "#d97706",
  web: "#14b8a6",
  agent: "#f97316",
  mcp: "#ec4899",
  todo: "#fbbf24",
  thinking: "#8b5cf6",
  unknown: "#64748b",
};

function colorFor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown;
}

export function ToolRankingChart({ tools }: Props) {
  const top = [...tools].sort((a, b) => b.totalCalls - a.totalCalls).slice(0, 20);

  if (top.length === 0) {
    return (
      <div
        role="img"
        aria-label="Tool ranking — no data"
        className="flex h-40 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No tool calls recorded yet
      </div>
    );
  }

  return (
    <div role="img" aria-label="Tool calls ranked by total count" className="w-full">
      <ResponsiveContainer width="100%" height={Math.max(220, top.length * 28)}>
        <BarChart data={top} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => Number(v).toLocaleString()}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            width={130}
          />
          <Tooltip
            contentStyle={{
              background: "rgb(var(--color-panel))",
              border: "1px solid rgb(var(--color-line))",
              borderRadius: 4,
              fontSize: 12,
            }}
            formatter={(val, _name, item: TooltipPayloadEntry) => {
              const calls = typeof val === "number" ? val : Number(val ?? 0);
              // `item.payload` carries the original row (`ToolSummary`), which
              // Recharts types as `any`. Narrow defensively before reading.
              const row = item.payload as { name?: unknown } | undefined;
              const toolName = typeof row?.name === "string" ? row.name : "";
              return [`${calls.toLocaleString()} calls`, toolName];
            }}
          />
          <Bar dataKey="totalCalls" radius={[0, 3, 3, 0]}>
            {top.map((t) => (
              <Cell key={t.name} fill={colorFor(t.category)} fillOpacity={0.92} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

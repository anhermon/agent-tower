"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ProjectSummary } from "@control-plane/core";

import { formatTokens } from "@/lib/format";

import type { ChartTooltipProps } from "./_types";

interface Props {
  readonly projects: readonly ProjectSummary[];
}

const COLORS = ["#d97706", "#16a34a", "#2563eb", "#ea580c", "#34d399", "#64748b"];

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

export function ProjectActivityDonut({ projects }: Props) {
  const ranked = [...projects]
    .map((p) => ({
      name: p.displayName || p.id,
      value: (p.usage.inputTokens ?? 0) + (p.usage.outputTokens ?? 0),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5);
  const othersTotal = rest.reduce((s, r) => s + r.value, 0);
  const data = [...top];
  if (othersTotal > 0) data.push({ name: "others", value: othersTotal });

  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label="Project activity — no data"
        className="flex h-52 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No project data
      </div>
    );
  }

  return (
    <div role="img" aria-label="Project activity donut chart" className="w-full">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
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

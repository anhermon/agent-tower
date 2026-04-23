"use client";

import type { JSX } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SkillUsageStats } from "@/lib/skills-usage-source";
import { formatShortDate } from "./format-usage";

const PALETTE = [
  "#38bdf8",
  "#34d399",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#60a5fa",
  "#fb7185",
  "#f97316",
];
const OTHER_COLOR = "#475569";
const OTHER_KEY = "__other__";

type Row = { date: string } & Record<string, number | string>;

interface Series {
  readonly key: string;
  readonly name: string;
  readonly color: string;
}

interface TooltipPayloadEntry {
  readonly dataKey: string;
  readonly name: string;
  readonly value: number;
  readonly color: string;
}

interface TooltipProps {
  readonly active?: boolean;
  readonly payload?: readonly TooltipPayloadEntry[];
  readonly label?: string;
}

function formatY(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
}

function BreakdownTooltip({ active, payload, label }: TooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload
    .filter((p) => typeof p.value === "number" && p.value > 0)
    .slice()
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-sm border border-line/70 bg-panel/95 px-3 py-2 text-xs shadow-glass">
      <p className="text-muted">{formatShortDate(label ?? null)}</p>
      {rows.map((r) => (
        <p key={r.dataKey} style={{ color: r.color }}>
          {r.name}: <span className="font-semibold text-ink">{r.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

export function SkillsBreakdownChart({
  perSkill,
  topN = 6,
}: {
  readonly perSkill: readonly SkillUsageStats[];
  readonly topN?: number;
}): JSX.Element {
  if (perSkill.length === 0) {
    return (
      <div className="glass-panel-soft rounded-sm p-6 text-center text-sm text-muted">
        Not enough history to plot a breakdown yet.
      </div>
    );
  }

  const sorted = [...perSkill].sort((a, b) => b.invocationCount - a.invocationCount);
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const hasOther = rest.length > 0;

  const topIds = new Set(top.map((s) => s.skillId));
  const dateSet = new Set<string>();
  for (const skill of perSkill) {
    for (const point of skill.perDay) {
      dateSet.add(point.date);
    }
  }
  const dates = [...dateSet].sort();

  if (dates.length === 0) {
    return (
      <div className="glass-panel-soft rounded-sm p-6 text-center text-sm text-muted">
        Not enough history to plot a breakdown yet.
      </div>
    );
  }

  const rows: Row[] = dates.map((date) => {
    const row: Row = { date };
    for (const skill of top) {
      row[skill.skillId] = 0;
    }
    if (hasOther) row[OTHER_KEY] = 0;
    for (const skill of perSkill) {
      const hit = skill.perDay.find((p) => p.date === date);
      if (!hit) continue;
      if (topIds.has(skill.skillId)) {
        row[skill.skillId] = ((row[skill.skillId] as number) ?? 0) + hit.count;
      } else if (hasOther) {
        row[OTHER_KEY] = ((row[OTHER_KEY] as number) ?? 0) + hit.count;
      }
    }
    return row;
  });

  const series: Series[] = top.map((skill, idx) => ({
    key: skill.skillId,
    name: skill.displayName,
    color: PALETTE[idx % PALETTE.length] ?? "#38bdf8",
  }));
  if (hasOther) {
    series.push({ key: OTHER_KEY, name: "other", color: OTHER_COLOR });
  }

  return (
    <div role="img" aria-label="Invocations per day by skill" className="w-full">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            tickFormatter={(v: string) => formatShortDate(v)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatY}
            width={40}
          />
          <Tooltip
            content={<BreakdownTooltip />}
            cursor={{ fill: "rgb(var(--color-line))", fillOpacity: 0.2 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            formatter={(v) => <span style={{ color: "rgb(var(--color-muted))" }}>{v}</span>}
          />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="1" fill={s.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

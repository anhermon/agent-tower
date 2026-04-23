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
const VISIBLE_HOUR_LABELS = new Set(["00", "03", "06", "09", "12", "15", "18", "21"]);

type Row = { hour: string } & Record<string, number | string>;

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

function HourTooltip({ active, payload, label }: TooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload
    .filter((p) => typeof p.value === "number" && p.value > 0)
    .slice()
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-sm border border-line/70 bg-panel/95 px-3 py-2 text-xs shadow-glass">
      <p className="text-muted">{label ?? ""}:00 UTC</p>
      {rows.map((r) => (
        <p key={r.dataKey} style={{ color: r.color }}>
          {r.name}: <span className="font-semibold text-ink">{r.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

export function HourBreakdownChart({
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

  const rows: Row[] = Array.from({ length: 24 }, (_, hour) => {
    const row: Row = { hour: hour.toString().padStart(2, "0") };
    for (const skill of top) {
      row[skill.skillId] = 0;
    }
    if (hasOther) row[OTHER_KEY] = 0;
    for (const skill of perSkill) {
      const count = skill.perHourOfDay[hour] ?? 0;
      if (count === 0) continue;
      if (topIds.has(skill.skillId)) {
        row[skill.skillId] = ((row[skill.skillId] as number) ?? 0) + count;
      } else if (hasOther) {
        row[OTHER_KEY] = ((row[OTHER_KEY] as number) ?? 0) + count;
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
    <div role="img" aria-label="Invocations per hour of day by skill" className="w-full">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            interval={2}
            tickFormatter={(v: string) => (VISIBLE_HOUR_LABELS.has(v) ? v : "")}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatY}
            width={40}
          />
          <Tooltip
            content={<HourTooltip />}
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

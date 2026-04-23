"use client";

import type { JSX } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShortDate } from "./format-usage";

interface Point {
  readonly date: string;
  readonly count: number;
}

interface TooltipPayloadEntry {
  readonly value: number;
  readonly payload: Row;
}

interface TooltipProps {
  readonly active?: boolean;
  readonly payload?: readonly TooltipPayloadEntry[];
}

interface Row {
  readonly date: string;
  readonly label: string;
  readonly count: number;
}

function formatY(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
}

function CustomTooltip({ active, payload }: TooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-sm border border-line/70 bg-panel/95 px-3 py-2 text-xs shadow-glass">
      <p className="text-muted">
        {formatShortDate(row.date)} <span className="text-muted-strong">·</span>{" "}
        <span className="font-semibold text-ink">{row.count.toLocaleString()}</span> invocations
      </p>
    </div>
  );
}

export function SkillsTimeline({ series }: { readonly series: readonly Point[] }): JSX.Element {
  if (series.length === 0) {
    return (
      <div className="glass-panel-soft rounded-sm p-6 text-center text-sm text-muted">
        Not enough history to plot a timeline yet.
      </div>
    );
  }

  const rows: Row[] = series.map((p) => ({
    date: p.date,
    label: formatShortDate(p.date),
    count: p.count,
  }));

  let max = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const p of series) {
    if (p.count > max) max = p.count;
    if (first === null) first = p.date;
    last = p.date;
  }

  return (
    <div className="glass-panel-soft flex flex-col gap-3 rounded-sm p-4">
      <div className="flex items-baseline justify-between text-[11px] text-muted">
        <span>
          <span className="eyebrow mr-2">From</span>
          <span className="font-mono text-muted-strong">{formatShortDate(first)}</span>
        </span>
        <span>
          <span className="eyebrow mr-2">Peak</span>
          <span className="font-mono text-muted-strong">{max.toLocaleString()}</span>
        </span>
        <span>
          <span className="eyebrow mr-2">To</span>
          <span className="font-mono text-muted-strong">{formatShortDate(last)}</span>
        </span>
      </div>

      <div role="img" aria-label="Invocations per day" className="w-full">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatY}
              width={40}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgb(var(--color-line))", fillOpacity: 0.2 }}
            />
            <Bar dataKey="count" fill="#38bdf8" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

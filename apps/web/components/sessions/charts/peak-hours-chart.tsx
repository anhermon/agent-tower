/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Recharts CustomTooltip props are typed as any by the library */
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

import type { HourBin } from "@control-plane/core";

interface Props {
  readonly data: readonly HourBin[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const hour = Number(label);
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return (
    <div className="rounded-sm border border-line/70 bg-panel/95 px-3 py-2 text-xs shadow-glass">
      <p className="text-muted">
        {h12}:00 {period}
      </p>
      <p className="font-semibold text-ink">{payload[0].value.toLocaleString()} messages</p>
    </div>
  );
}

export function PeakHoursChart({ data }: Props) {
  const byHour = new Map<number, number>();
  for (const b of data) byHour.set(b.hour, b.messageCount);
  const rows = Array.from({ length: 24 }, (_, i) => ({
    hour: String(i),
    count: byHour.get(i) ?? 0,
  }));

  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) {
    return (
      <div
        role="img"
        aria-label="Peak hours — no data"
        className="flex h-40 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No data in range
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const topHours = new Set(sorted.slice(0, 3).map((r) => r.hour));
  const topFill = "#d97706";
  const normalFill = "rgba(217, 119, 6, 0.25)";

  return (
    <div role="img" aria-label="Peak hours bar chart" className="w-full">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={rows} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 10, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => {
              const h = Number(v);
              if (h === 0) return "12a";
              if (h === 12) return "12p";
              return h < 12 ? `${h}a` : `${h - 12}p`;
            }}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(217,119,6,0.08)" }} />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={14}>
            {rows.map((d) => (
              <Cell key={d.hour} fill={topHours.has(d.hour) ? topFill : normalFill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-muted/70">top 3 peak hours highlighted</p>
    </div>
  );
}

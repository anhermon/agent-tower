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

import type { DayOfWeekBin } from "@control-plane/core";

interface Props {
  readonly data: readonly DayOfWeekBin[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function DayOfWeekChart({ data }: Props) {
  const byDay = new Map<number, number>();
  for (const b of data) byDay.set(b.day, b.messageCount);
  const rows = DAYS.map((label, i) => ({ day: label, count: byDay.get(i) ?? 0 }));
  const max = Math.max(...rows.map((r) => r.count), 1);
  const total = rows.reduce((s, r) => s + r.count, 0);

  if (total === 0) {
    return (
      <div
        role="img"
        aria-label="Day of week — no data"
        className="flex h-40 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No data in range
      </div>
    );
  }

  return (
    <div role="img" aria-label="Activity by day of week" className="w-full">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={rows} margin={{ top: 4, right: 6, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "rgb(var(--color-muted))" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "rgb(var(--color-panel))",
              border: "1px solid rgb(var(--color-line))",
              borderRadius: 4,
              fontSize: 12,
            }}
            formatter={((val: unknown) => [Number(val ?? 0).toLocaleString(), "messages"]) as never}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {rows.map((d) => (
              <Cell
                key={d.day}
                fill={
                  d.count === max
                    ? "#d97706"
                    : d.count > max * 0.6
                      ? "rgba(217,119,6,0.7)"
                      : "rgba(217,119,6,0.3)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

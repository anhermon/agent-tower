"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TimeseriesPoint } from "@control-plane/core";

interface Props {
  readonly data: readonly TimeseriesPoint[];
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatY(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm border border-line/70 bg-panel/95 px-3 py-2 text-xs shadow-glass">
      <p className="text-muted">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold text-ink">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

export function UsageOverTimeChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label="Usage over time — no data in range"
        className="flex h-48 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No data in range
      </div>
    );
  }

  const rows = data.map((point) => ({
    date: formatDate(point.date),
    messages: point.messageCount,
    sessions: point.sessionCount,
  }));

  return (
    <div role="img" aria-label="Usage over time area chart" className="w-full">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradMessages" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#d97706" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" vertical={false} />
          <XAxis
            dataKey="date"
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
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            formatter={(v) => <span style={{ color: "rgb(var(--color-muted))" }}>{v}</span>}
          />
          <Area
            type="monotone"
            dataKey="messages"
            stroke="#d97706"
            strokeWidth={2}
            fill="url(#gradMessages)"
            dot={false}
            activeDot={{ r: 3, fill: "#fbbf24" }}
          />
          <Area
            type="monotone"
            dataKey="sessions"
            stroke="#34d399"
            strokeWidth={1.5}
            fill="url(#gradSessions)"
            dot={false}
            activeDot={{ r: 3, fill: "#6ee7b7" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

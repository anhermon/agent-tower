"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ReplayCompactionEvent, ReplayTurn } from "@control-plane/core";

import { formatCost, formatTokens } from "@/lib/format";

interface Props {
  readonly turns: readonly ReplayTurn[];
  readonly compactions: readonly ReplayCompactionEvent[];
}

interface Point {
  readonly turn: number;
  readonly tokens: number;
  readonly cost: number;
}

export function TokenAccumulationChart({ turns, compactions }: Props) {
  const data = useMemo<Point[]>(() => {
    const points: Point[] = [];
    let cumCost = 0;
    let i = 0;
    for (const t of turns) {
      i++;
      if (t.type !== "assistant" || !t.usage) continue;
      const tokens = (t.usage.inputTokens ?? 0) + (t.usage.cacheReadInputTokens ?? 0);
      cumCost += t.estimatedCostUsd ?? 0;
      points.push({ turn: i, tokens, cost: cumCost });
    }
    return points;
  }, [turns]);

  const markerIndices = useMemo(() => compactions.map((c) => c.turnIndex), [compactions]);

  if (data.length === 0) return null;

  return (
    <div className="glass-panel rounded-md p-4">
      <h3 className="eyebrow mb-3">Token accumulation per turn</h3>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...data]} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="turn"
              tick={{ fontSize: 10, fill: "var(--muted, #7a8194)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted, #7a8194)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatTokens(v)}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(15,17,22,0.95)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                fontSize: 12,
                color: "#e5e7eb",
              }}
              formatter={
                ((val: unknown, name: unknown) => {
                  const num = Array.isArray(val) ? Number((val as unknown[])[0]) : Number(val);
                  if (name === "tokens") return [formatTokens(num), "Context tokens"];
                  return [formatCost(num), "Cumulative cost"];
                }) as never
              }
            />
            {markerIndices.map((idx) => (
              <ReferenceLine
                key={idx}
                x={idx}
                stroke="#f59e0b"
                strokeDasharray="4 2"
                label={{ value: "⚡", position: "top", fontSize: 12, fill: "#f59e0b" }}
              />
            ))}
            <Line
              type="monotone"
              dataKey="tokens"
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

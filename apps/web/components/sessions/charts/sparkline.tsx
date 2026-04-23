"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

interface SparklineProps {
  readonly data: readonly number[];
  readonly color?: string;
  readonly height?: number;
  readonly ariaLabel?: string;
}

/**
 * Minimal line chart — no axes, no tooltip — suitable for stat cards.
 * Duplicates a single-point input so recharts draws a flat segment instead
 * of nothing.
 */
export function Sparkline({
  data,
  color = "rgb(143 124 255)",
  height = 36,
  ariaLabel,
}: SparklineProps) {
  const points = data.length === 1 ? [{ v: data[0] }, { v: data[0] }] : data.map((v) => ({ v }));
  if (points.length === 0) {
    return <div aria-hidden className="h-full w-full" style={{ height }} />;
  }
  return (
    <div role="img" aria-label={ariaLabel ?? "sparkline"} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            strokeOpacity={0.75}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

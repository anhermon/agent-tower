"use client";

import { useMemo, type JSX } from "react";
import { formatShortDate } from "./format-usage";

interface Point {
  readonly date: string;
  readonly count: number;
}

/**
 * Area chart of invocations per day rendered as a single responsive SVG.
 *
 * - X axis is the ordinal day index (no date gap compensation — the upstream
 *   data layer owns whether to fill gaps).
 * - Y axis is linear from 0 to max(count).
 * - Outliers (days with count > 1.5× the median non-zero count) get a marker.
 *
 * No charting library is used; every shape is a stock SVG primitive so the
 * component can hydrate on the client without extra bundle weight.
 */
export function SkillsTimeline({
  series
}: {
  readonly series: readonly Point[];
}): JSX.Element {
  const { path, area, markers, max, first, last } = useMemo(
    () => buildTimeline(series),
    [series]
  );

  if (series.length < 2) {
    return (
      <div className="glass-panel-soft rounded-sm p-6 text-center text-sm text-muted">
        Not enough history to plot a timeline yet.
      </div>
    );
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

      <div className="relative w-full">
        <svg
          role="img"
          aria-label="Invocations per day"
          viewBox="0 0 1000 160"
          preserveAspectRatio="none"
          className="h-40 w-full"
        >
          <title>Invocations per day</title>
          {/* Gridlines */}
          <line
            x1="0"
            y1="0.5"
            x2="1000"
            y2="0.5"
            stroke="currentColor"
            strokeOpacity="0.08"
            className="text-muted"
          />
          <line
            x1="0"
            y1="159.5"
            x2="1000"
            y2="159.5"
            stroke="currentColor"
            strokeOpacity="0.12"
            className="text-muted"
          />

          <path d={area} className="fill-info/20" />
          <path
            d={path}
            className="stroke-info"
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {markers.map((m) => (
            <circle
              key={`${m.date}-${m.x}`}
              cx={m.x}
              cy={m.y}
              r={3}
              className="fill-info stroke-canvas"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${m.date} · ${m.count} invocations`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}

interface BuildResult {
  readonly path: string;
  readonly area: string;
  readonly markers: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly count: number;
    readonly date: string;
  }>;
  readonly max: number;
  readonly first: string | null;
  readonly last: string | null;
}

function buildTimeline(series: readonly Point[]): BuildResult {
  if (series.length === 0) {
    return { path: "", area: "", markers: [], max: 0, first: null, last: null };
  }

  const width = 1000;
  const height = 160;

  let max = 0;
  for (const p of series) {
    if (p.count > max) max = p.count;
  }
  const safeMax = max === 0 ? 1 : max;

  const denom = series.length === 1 ? 1 : series.length - 1;
  const coords = series.map((p, idx) => {
    const x = (idx / denom) * width;
    const y = height - (p.count / safeMax) * (height - 4) - 2;
    return { x, y, count: p.count, date: p.date };
  });

  const pathParts: string[] = [];
  coords.forEach((c, idx) => {
    pathParts.push(`${idx === 0 ? "M" : "L"}${c.x.toFixed(2)} ${c.y.toFixed(2)}`);
  });
  const path = pathParts.join(" ");

  const firstCoord = coords[0]!;
  const lastCoord = coords[coords.length - 1]!;
  const area = `M${firstCoord.x.toFixed(2)} ${height} ${pathParts
    .join(" ")
    .replace(/^M/, "L")} L${lastCoord.x.toFixed(2)} ${height} Z`;

  // Outlier threshold: 1.5× median of non-zero counts. Fallback to max when
  // the series is effectively flat.
  const nonZero = series.map((p) => p.count).filter((c) => c > 0).sort((a, b) => a - b);
  let threshold = safeMax;
  if (nonZero.length > 0) {
    const mid = Math.floor(nonZero.length / 2);
    const median =
      nonZero.length % 2 === 0
        ? ((nonZero[mid - 1] ?? 0) + (nonZero[mid] ?? 0)) / 2
        : (nonZero[mid] ?? 0);
    if (median > 0) threshold = median * 1.5;
  }

  const markers = coords
    .filter((c) => c.count > 1 && c.count >= threshold)
    .map((c) => ({ x: c.x, y: c.y, count: c.count, date: c.date }));

  return {
    path,
    area,
    markers,
    max,
    first: firstCoord.date,
    last: lastCoord.date
  };
}

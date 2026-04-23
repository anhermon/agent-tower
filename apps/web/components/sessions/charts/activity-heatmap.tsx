"use client";

import { useMemo } from "react";

import type { TimeseriesPoint } from "@control-plane/core";

interface Props {
  readonly data: readonly TimeseriesPoint[];
}

/** Quantile scale: 5 bins chosen from sorted non-zero counts so distribution
 *  is robust to outliers. Index 0 → empty cell, 1..4 → increasing intensity. */
function makeQuantileScale(counts: readonly number[]): (count: number) => number {
  const nonZero = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return () => 0;
  const q = (p: number) => {
    const idx = Math.max(0, Math.min(nonZero.length - 1, Math.floor(nonZero.length * p)));
    return nonZero[idx] ?? 0;
  };
  const b1 = q(0.25);
  const b2 = q(0.5);
  const b3 = q(0.75);
  return (count: number) => {
    if (count <= 0) return 0;
    if (count <= b1) return 1;
    if (count <= b2) return 2;
    if (count <= b3) return 3;
    return 4;
  };
}

// Paired shades: 0 = empty, 1..4 = ramp. Tuned to read against the panel
// background in both themes. Light = default `:root`; dark = `html.dark`.
// class via CSS variables, but since our chart fills are plain strings we
// pick mid-contrast swatches that work on both.
const SHADES = ["rgba(148, 163, 184, 0.18)", "#86efac", "#4ade80", "#16a34a", "#14532d"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeekSunday(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - r.getDay());
  return r;
}

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const CELL = 11;
const GAP = 2;
const DAY_LABEL_W = 26;
const MONTH_LABEL_H = 12;
const WEEKS = 53;

export function ActivityHeatmap({ data }: Props) {
  const { weeks, scale } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data) counts.set(p.date, p.messageCount);

    const today = new Date();
    const start = startOfWeekSunday(addDays(today, -(WEEKS - 1) * 7));
    const weekList: { startDate: Date; days: { date: string; count: number; label: Date }[] }[] =
      [];
    for (let w = 0; w < WEEKS; w++) {
      const weekStart = addDays(start, w * 7);
      const days: { date: string; count: number; label: Date }[] = [];
      for (let di = 0; di < 7; di++) {
        const d = addDays(weekStart, di);
        const iso = toIsoDate(d);
        days.push({ date: iso, count: counts.get(iso) ?? 0, label: d });
      }
      weekList.push({ startDate: weekStart, days });
    }
    const allCounts = weekList.flatMap((w) => w.days.map((d) => d.count));
    return { weeks: weekList, scale: makeQuantileScale(allCounts) };
  }, [data]);

  const totalMessages = weeks.reduce((s, w) => s + w.days.reduce((s2, d) => s2 + d.count, 0), 0);

  if (totalMessages === 0) {
    return (
      <div
        role="img"
        aria-label="Activity heatmap — no data"
        className="flex h-40 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No activity in range
      </div>
    );
  }

  const width = DAY_LABEL_W + WEEKS * (CELL + GAP);
  const height = MONTH_LABEL_H + 7 * (CELL + GAP);

  return (
    <div role="img" aria-label="Activity heatmap" className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-full"
        style={{ minWidth: 560 }}
      >
        {/* Month labels — show at the first week of each new month */}
        {weeks.map((w, wi) => {
          const first = w.days[0].label;
          const prev = wi > 0 ? weeks[wi - 1].days[0].label : null;
          if (prev && prev.getMonth() === first.getMonth()) return null;
          if (first.getDate() > 7) return null;
          const x = DAY_LABEL_W + wi * (CELL + GAP);
          return (
            <text
              key={`m-${wi}`}
              x={x}
              y={MONTH_LABEL_H - 2}
              fontSize={9}
              fill="rgb(var(--color-muted))"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {MONTH_NAMES[first.getMonth()]}
            </text>
          );
        })}
        {/* Day-of-week labels */}
        {DAY_LABELS.map((lbl, di) => (
          <text
            key={`d-${di}`}
            x={0}
            y={MONTH_LABEL_H + di * (CELL + GAP) + CELL - 1}
            fontSize={9}
            fill="rgb(var(--color-muted))"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {lbl}
          </text>
        ))}
        {/* Cells */}
        {weeks.map((w, wi) =>
          w.days.map((day, di) => {
            const bin = scale(day.count);
            const x = DAY_LABEL_W + wi * (CELL + GAP);
            const y = MONTH_LABEL_H + di * (CELL + GAP);
            // Skip cells that fall past "today" to avoid rendering future days.
            if (day.label.getTime() > Date.now()) return null;
            return (
              <rect
                key={`c-${wi}-${di}`}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                ry={2}
                fill={SHADES[bin]}
                aria-label={`${day.date}: ${day.count} messages`}
              >
                <title>{`${day.date}: ${day.count} messages`}</title>
              </rect>
            );
          })
        )}
      </svg>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span>Less</span>
        {SHADES.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="inline-block h-3 w-3 rounded-[2px]"
            style={{ backgroundColor: s }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

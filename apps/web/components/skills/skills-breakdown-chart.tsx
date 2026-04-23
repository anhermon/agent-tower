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

interface BreakdownModel {
  readonly rows: readonly Row[];
  readonly series: readonly Series[];
}

function resolveBucketKey(
  skillId: string,
  topIds: ReadonlySet<string>,
  hasOther: boolean
): string | null {
  if (topIds.has(skillId)) return skillId;
  return hasOther ? OTHER_KEY : null;
}

function emptyRow(date: string, top: readonly SkillUsageStats[], hasOther: boolean): Row {
  const row: Row = { date };
  for (const t of top) row[t.skillId] = 0;
  if (hasOther) row[OTHER_KEY] = 0;
  return row;
}

function getOrCreateRow(
  rowByDate: Map<string, Row>,
  date: string,
  top: readonly SkillUsageStats[],
  hasOther: boolean
): Row {
  const existing = rowByDate.get(date);
  if (existing) return existing;
  const created = emptyRow(date, top, hasOther);
  rowByDate.set(date, created);
  return created;
}

/**
 * Build the chart rows (date→per-skill counts) in a single pass over `perSkill`.
 * Skills outside the top-N bucket are collapsed into the "other" series when
 * present. Avoids the O(dates × skills × perDay) `find` scan that locks the
 * render thread for thousands of invocations.
 */
function buildRowsByDate(
  perSkill: readonly SkillUsageStats[],
  top: readonly SkillUsageStats[],
  hasOther: boolean
): Map<string, Row> {
  const topIds = new Set(top.map((s) => s.skillId));
  const rowByDate = new Map<string, Row>();
  for (const skill of perSkill) {
    const bucketKey = resolveBucketKey(skill.skillId, topIds, hasOther);
    if (bucketKey === null) continue;
    for (const point of skill.perDay) {
      const row = getOrCreateRow(rowByDate, point.date, top, hasOther);
      row[bucketKey] = ((row[bucketKey] as number) ?? 0) + point.count;
    }
  }
  return rowByDate;
}

function buildSeries(top: readonly SkillUsageStats[], hasOther: boolean): Series[] {
  const series: Series[] = top.map((skill, idx) => ({
    key: skill.skillId,
    name: skill.displayName,
    color: PALETTE[idx % PALETTE.length] ?? "#38bdf8",
  }));
  if (hasOther) series.push({ key: OTHER_KEY, name: "other", color: OTHER_COLOR });
  return series;
}

function buildBreakdownModel(
  perSkill: readonly SkillUsageStats[],
  topN: number
): BreakdownModel | null {
  const sorted = [...perSkill].sort((a, b) => b.invocationCount - a.invocationCount);
  const top = sorted.slice(0, topN);
  const hasOther = sorted.length > topN;
  const rowByDate = buildRowsByDate(perSkill, top, hasOther);
  if (rowByDate.size === 0) return null;
  const rows: Row[] = [...rowByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const series = buildSeries(top, hasOther);
  return { rows, series };
}

function EmptyBreakdown(): JSX.Element {
  return (
    <div className="glass-panel-soft rounded-sm p-6 text-center text-sm text-muted">
      Not enough history to plot a breakdown yet.
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
  if (perSkill.length === 0) return <EmptyBreakdown />;
  const model = buildBreakdownModel(perSkill, topN);
  if (model === null) return <EmptyBreakdown />;
  const { rows, series } = model;

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

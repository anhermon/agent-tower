"use client";

import Link from "next/link";
import { type CSSProperties, type JSX, useMemo } from "react";

import { maxCount } from "./format-usage";

import type { SkillsUsageReport, SkillUsageStats } from "@/lib/skills-usage-source";

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Two-part heatmap view:
 *  - Global distributions over hour-of-day and day-of-week (compact strips).
 *  - Per-skill hour-of-day grid (rows = top N skills, cols = 24 hours).
 *
 * All colour is produced with a single hue (`hsl(200 ...)`) varying in
 * lightness from faint to saturated, then masked by a cell-local border
 * so empty cells still read as a grid. This avoids pulling in Chromatic /
 * d3 dependencies while keeping the view agent-agnostic.
 */
export function SkillsHeatmap({
  report,
  topN = 12,
}: {
  readonly report: SkillsUsageReport;
  readonly topN?: number;
}): JSX.Element {
  const topSkills = useMemo(() => report.perSkill.slice(0, topN), [report.perSkill, topN]);

  const perSkillMax = useMemo(() => {
    let max = 0;
    for (const skill of topSkills) {
      for (const count of skill.perHourOfDay) {
        if (count > max) max = count;
      }
    }
    return max;
  }, [topSkills]);

  const hourMax = maxCount(report.perHourOfDay);
  const dayMax = maxCount(report.perDayOfWeek);

  return (
    <div className="flex flex-col gap-5">
      <Legend />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-panel-soft rounded-sm p-4">
          <p className="eyebrow mb-3">Hour of day (UTC)</p>
          <HourStrip values={report.perHourOfDay} max={hourMax} />
        </div>
        <div className="glass-panel-soft rounded-sm p-4">
          <p className="eyebrow mb-3">Day of week (UTC)</p>
          <DayStrip values={report.perDayOfWeek} max={dayMax} />
        </div>
      </div>

      <div className="glass-panel-soft rounded-sm p-4">
        <p className="eyebrow mb-3">Per skill · hour of day (UTC)</p>
        {topSkills.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">No skill invocations to plot.</div>
        ) : (
          <PerSkillGrid skills={topSkills} max={perSkillMax} />
        )}
      </div>
    </div>
  );
}

function Legend(): JSX.Element {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
      <span className="eyebrow">Intensity</span>
      <span>0</span>
      <div className="flex items-center gap-0.5" aria-hidden="true">
        {stops.map((stop) => (
          <span
            key={stop}
            className="inline-block h-3 w-4 rounded-[2px] border border-line/40"
            style={{ backgroundColor: intensityColour(stop) }}
          />
        ))}
      </div>
      <span>peak</span>
    </div>
  );
}

function HourStrip({
  values,
  max,
}: {
  readonly values: readonly number[];
  readonly max: number;
}): JSX.Element {
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {HOUR_LABELS.map((hour) => {
          const raw = values[hour] ?? 0;
          return (
            <HeatCell
              key={hour}
              value={raw}
              max={max}
              label={`${pad2(hour)}:00 · ${raw} invocation${raw === 1 ? "" : "s"}`}
              size="md"
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted/70">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

function DayStrip({
  values,
  max,
}: {
  readonly values: readonly number[];
  readonly max: number;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {DAY_LABELS.map((label, idx) => {
          const raw = values[idx] ?? 0;
          return (
            <HeatCell
              key={label}
              value={raw}
              max={max}
              label={`${label} · ${raw} invocation${raw === 1 ? "" : "s"}`}
              size="lg"
            />
          );
        })}
      </div>
      <div className="flex gap-1">
        {DAY_LABELS.map((label) => (
          <span key={label} className="inline-block w-[42px] text-center text-[10px] text-muted/70">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PerSkillGrid({
  skills,
  max,
}: {
  readonly skills: readonly SkillUsageStats[];
  readonly max: number;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {skills.map((skill) => (
        <div key={skill.skillId} className="grid grid-cols-[10rem_1fr] items-center gap-3">
          <SkillLabel skill={skill} />
          <div className="flex gap-[2px]">
            {HOUR_LABELS.map((hour) => {
              const raw = skill.perHourOfDay[hour] ?? 0;
              return (
                <HeatCell
                  key={hour}
                  value={raw}
                  max={max}
                  label={`${skill.displayName} · ${pad2(hour)}:00 · ${raw}`}
                  size="sm"
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-1 grid grid-cols-[10rem_1fr] gap-3">
        <span />
        <div className="flex justify-between text-[10px] text-muted/70">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>
      </div>
    </div>
  );
}

function SkillLabel({ skill }: { skill: SkillUsageStats }): JSX.Element {
  const display = skill.displayName || skill.skillId;
  const base = "block w-40 truncate text-xs";
  if (skill.known) {
    return (
      <Link
        href={`/skills/${encodeURIComponent(skill.skillId)}`}
        className={`${base} text-ink hover:text-cyan`}
        title={skill.skillId}
      >
        {display}
      </Link>
    );
  }
  return (
    <span className={`${base} text-muted`} title={`${skill.skillId} (unknown)`}>
      {display}
    </span>
  );
}

type CellSize = "sm" | "md" | "lg";

function HeatCell({
  value,
  max,
  label,
  size,
}: {
  readonly value: number;
  readonly max: number;
  readonly label: string;
  readonly size: CellSize;
}): JSX.Element {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const dim = size === "sm" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-5 w-[42px]";
  const style: CSSProperties =
    value === 0 ? { backgroundColor: "transparent" } : { backgroundColor: intensityColour(ratio) };

  return (
    <span
      title={label}
      className={`${dim} inline-block rounded-[2px] border border-line/40`}
      style={style}
    />
  );
}

/**
 * Map an intensity ratio in `[0, 1]` to a cyan-leaning HSL colour. Zero
 * intensity returns a near-transparent fill so the cell border still draws
 * the grid.
 */
function intensityColour(ratio: number): string {
  if (ratio <= 0) return "hsl(200 30% 20% / 0.05)";
  // Lightness sweeps from ~22% (strong) to ~48% (faint) so higher ratios are
  // more saturated-looking. Alpha also rises so low values stay subtle.
  const lightness = 48 - ratio * 26;
  const alpha = 0.25 + ratio * 0.65;
  return `hsl(200 80% ${lightness.toFixed(1)}% / ${alpha.toFixed(2)})`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

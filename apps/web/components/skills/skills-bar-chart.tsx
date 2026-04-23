"use client";

import Link from "next/link";
import { type JSX, useMemo, useState } from "react";
import type { SkillUsageStats } from "@/lib/skills-usage-source";
import { formatBytes, formatTokens } from "./format-usage";

type Metric = "invocations" | "size" | "composite";

interface MetricConfig {
  readonly key: Metric;
  readonly label: string;
  readonly pick: (stat: SkillUsageStats) => number;
  readonly format: (value: number) => string;
}

const METRICS: ReadonlyArray<MetricConfig> = [
  {
    key: "invocations",
    label: "Invocations",
    pick: (stat) => stat.invocationCount,
    format: (value) => value.toLocaleString(),
  },
  {
    key: "size",
    label: "Skill size",
    pick: (stat) => stat.sizeBytes,
    format: (value) => formatBytes(value),
  },
  {
    key: "composite",
    label: "Tokens injected",
    pick: (stat) => stat.tokensInjected,
    format: (value) => formatTokens(value),
  },
];

/**
 * Horizontal bar chart for the top N skills across one of three metrics.
 *
 * - "invocations" is the raw call count.
 * - "size" is the static on-disk size of the SKILL.md (independent of usage).
 * - "composite" is invocations × approxTokens, i.e. total tokens injected.
 *
 * The chart is a plain Tailwind flex column — no SVG needed — which keeps row
 * heights legible on narrow viewports.
 */
export function SkillsBarChart({
  skills,
  topN = 15,
  initialMetric = "invocations",
}: {
  readonly skills: readonly SkillUsageStats[];
  readonly topN?: number;
  readonly initialMetric?: Metric;
}): JSX.Element {
  const [metric, setMetric] = useState<Metric>(initialMetric);
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0]!;

  const rows = useMemo(() => {
    const scored = skills.map((skill) => ({
      skill,
      value: active.pick(skill),
    }));
    scored.sort((a, b) => b.value - a.value);
    return scored.slice(0, topN);
  }, [skills, active, topN]);

  const max = rows.reduce((acc, row) => (row.value > acc ? row.value : acc), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Metric</span>
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`control-chip${metric === m.key ? " is-active" : ""}`}
            aria-pressed={metric === m.key}
          >
            {m.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="glass-panel-soft rounded-sm p-6 text-center text-sm text-muted">
          No skill invocations yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ skill, value }, idx) => {
            // True relative share. The previous 1.5% floor visually inflated
            // near-zero values; use exact percentages here so the chart is
            // honest. Zero-value rows render a zero-width bar.
            const pct = max > 0 ? (value / max) * 100 : 0;
            return (
              <li
                key={skill.skillId}
                className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3"
              >
                <SkillLabel skill={skill} />
                <div className="bar-track" aria-hidden="true">
                  <div className="h-full rounded-full bg-info/70" style={{ width: `${pct}%` }} />
                </div>
                <span
                  className="w-20 shrink-0 text-right font-mono text-xs text-muted-strong"
                  title={`${value.toLocaleString()} (${active.label.toLowerCase()})`}
                >
                  {active.format(value)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SkillLabel({ skill }: { skill: SkillUsageStats }): JSX.Element {
  const display = skill.displayName || skill.skillId;
  const className = "block w-48 truncate text-sm text-ink";
  if (skill.known) {
    return (
      <Link
        href={`/skills/${encodeURIComponent(skill.skillId)}`}
        className={`${className} hover:text-cyan`}
        title={skill.skillId}
      >
        {display}
      </Link>
    );
  }
  return (
    <span className={`${className} text-muted`} title={`${skill.skillId} (unknown)`}>
      {display}
    </span>
  );
}

"use client";

import { formatPercent } from "./format-efficacy";

import type { SkillsEfficacyReport } from "@/lib/skills-efficacy-source";
import type { JSX } from "react";

/**
 * Stat-card strip for the Skill Efficacy dashboard. Mirrors the
 * {@code SkillsUsageSummary} layout so the two analytics views feel like
 * siblings.
 */
export function SkillsEfficacySummary({
  report,
}: {
  readonly report: SkillsEfficacyReport;
}): JSX.Element {
  const items: readonly {
    readonly label: string;
    readonly value: string;
    readonly hint?: string;
  }[] = [
    {
      label: "Sessions analyzed",
      value: report.sessionsAnalyzed.toLocaleString(),
    },
    {
      label: "Sessions w/ skill",
      value: report.sessionsWithSkill.toLocaleString(),
      hint: `${report.baseline.sessionsScored.toLocaleString()} scored for baseline`,
    },
    {
      label: "Baseline effective score",
      value: formatPercent(report.baseline.effectiveScore),
      hint: "satisfaction × outcome",
    },
    {
      label: "Skills profiled",
      value: report.skillsProfiled.toLocaleString(),
      hint: `${report.qualifying.length} qualifying · ${report.insufficientData.length} below threshold`,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="glass-panel-soft rounded-sm p-3">
          <dt className="eyebrow">{item.label}</dt>
          <dd className="mt-1 truncate text-xl font-semibold text-ink" title={item.value}>
            {item.value}
          </dd>
          {item.hint ? (
            <p className="mt-1 truncate text-[11px] text-muted" title={item.hint}>
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

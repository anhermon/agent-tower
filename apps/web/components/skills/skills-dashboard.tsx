"use client";

import type { JSX } from "react";
import type { SkillsUsageReport } from "@/lib/skills-usage-source";
import { HourBreakdownChart } from "./hour-breakdown-chart";
import { SkillsBarChart } from "./skills-bar-chart";
import { SkillsBreakdownChart } from "./skills-breakdown-chart";
import { SkillsHeatmap } from "./skills-heatmap";
import { SkillsTimeline } from "./skills-timeline";
import { SkillsUsageSummary } from "./skills-usage-summary";

/**
 * Composition shell for the Skills usage analytics view. Orders the four
 * sub-components into the canonical "what happened / which / when / gaps"
 * narrative:
 *
 *   1. Invocation volume (summary + timeline)
 *   2. Top skills (bar chart)
 *   3. When are skills used? (heatmap)
 *   4. Unknown invocations (only when present)
 */
export function SkillsDashboard({ report }: { readonly report: SkillsUsageReport }): JSX.Element {
  const unknowns = report.perSkill.filter((stat) => !stat.known);

  return (
    <div className="flex flex-col gap-8">
      <Section title="Invocation volume">
        <SkillsUsageSummary report={report} />
        <SkillsTimeline series={report.perDay} />
      </Section>

      <Section title="Daily breakdown by skill">
        <div className="glass-panel rounded-md p-5">
          <SkillsBreakdownChart perSkill={report.perSkill} />
        </div>
      </Section>

      <Section title="Top skills">
        <div className="glass-panel rounded-md p-5">
          <SkillsBarChart skills={report.perSkill} />
        </div>
      </Section>

      <Section title="When are skills used?">
        <div className="glass-panel rounded-md p-5 space-y-5">
          <HourBreakdownChart perSkill={report.perSkill} />
          <SkillsHeatmap report={report} />
        </div>
      </Section>

      {report.totals.unknownSkills > 0 ? (
        <Section title="Unknown invocations">
          <UnknownNotice unknowns={unknowns} />
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function UnknownNotice({
  unknowns,
}: {
  readonly unknowns: readonly { readonly skillId: string; readonly invocationCount: number }[];
}): JSX.Element {
  return (
    <div className="glass-panel rounded-md p-5">
      <p className="text-sm text-muted">
        These skill ids were invoked but are not present in the local catalogue. They may have been
        renamed, removed, or live under a root that is not configured.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {unknowns.map((u) => (
          <li
            key={u.skillId}
            className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-muted"
            title={`${u.skillId} · ${u.invocationCount} invocations`}
          >
            <span className="text-muted-strong">{u.skillId}</span>
            <span className="text-muted/70">× {u.invocationCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

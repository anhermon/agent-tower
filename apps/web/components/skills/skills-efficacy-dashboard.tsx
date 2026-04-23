"use client";

import { SkillsEfficacyInsufficient } from "./skills-efficacy-insufficient";
import { SkillsEfficacyNarratives } from "./skills-efficacy-narratives";
import { SkillsEfficacySummary } from "./skills-efficacy-summary";
import { SkillsEfficacyTable } from "./skills-efficacy-table";

import type { SkillsEfficacyReport } from "@/lib/skills-efficacy-source";
import type { JSX } from "react";

/**
 * Composition shell for the Skill Efficacy view. Orders the four
 * sub-components into the canonical "headline / table / narrative / gaps"
 * flow. Renders nothing when no sessions have been analyzed yet — callers
 * are expected to render an empty state at the route level.
 */
export function SkillsEfficacyDashboard({
  report,
}: {
  readonly report: SkillsEfficacyReport;
}): JSX.Element | null {
  if (report.sessionsAnalyzed === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      <Section title="Efficacy at a glance">
        <SkillsEfficacySummary report={report} />
      </Section>

      <Section title="Qualifying skills">
        <SkillsEfficacyTable rows={report.qualifying} baseline={report.baseline} />
      </Section>

      <Section title="Signals">
        <SkillsEfficacyNarratives rows={report.qualifying} />
      </Section>

      {report.insufficientData.length > 0 ? (
        <Section title="Insufficient data">
          <SkillsEfficacyInsufficient
            rows={report.insufficientData}
            minSessions={report.minSessionsForQualifying}
          />
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

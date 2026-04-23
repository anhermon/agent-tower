"use client";

import type { JSX } from "react";
import type { SkillsUsageReport } from "@/lib/skills-usage-source";
import { formatShortDate, formatTokens } from "./format-usage";

/**
 * Stat-card strip for the Skills usage dashboard. Mirrors the
 * {@code SummaryStrip} layout used on the Skills listing page so both views
 * feel like siblings.
 */
export function SkillsUsageSummary({
  report,
}: {
  readonly report: SkillsUsageReport;
}): JSX.Element {
  const { totals } = report;

  const timespan =
    totals.firstInvokedAt && totals.lastInvokedAt
      ? `${formatShortDate(totals.firstInvokedAt)} → ${formatShortDate(totals.lastInvokedAt)}`
      : "—";

  const items: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
    readonly hint?: string;
  }> = [
    {
      label: "Total invocations",
      value: totals.totalInvocations.toLocaleString(),
    },
    {
      label: "Distinct skills",
      value: totals.distinctSkills.toLocaleString(),
      hint: `${totals.knownSkills} known · ${totals.unknownSkills} unknown`,
    },
    {
      label: "Sessions scanned",
      value: totals.sessionsScanned.toLocaleString(),
      hint: `${totals.filesScanned.toLocaleString()} files`,
    },
    {
      label: "Tokens injected",
      value: formatTokens(totals.totalTokensInjected),
    },
    {
      label: "Time span",
      value: timespan,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

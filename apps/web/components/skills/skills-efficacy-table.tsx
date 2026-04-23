"use client";

import Link from "next/link";
import { type JSX, useMemo, useState } from "react";

import { formatDelta, formatPercent, outcomeColor } from "./format-efficacy";

import type {
  EfficacyBaseline,
  SessionOutcome,
  SkillEfficacyRow,
} from "@/lib/skills-efficacy-source";

type SortKey = "delta" | "sessions" | "effective";

interface SortConfig {
  readonly key: SortKey;
  readonly label: string;
  readonly compare: (a: SkillEfficacyRow, b: SkillEfficacyRow) => number;
}

const SORTS: readonly SortConfig[] = [
  {
    key: "delta",
    label: "Δ vs baseline",
    compare: (a, b) => b.delta - a.delta,
  },
  {
    key: "sessions",
    label: "Sessions",
    compare: (a, b) => b.sessionsCount - a.sessionsCount,
  },
  {
    key: "effective",
    label: "Effective",
    compare: (a, b) => b.avgEffectiveScore - a.avgEffectiveScore,
  },
];

/**
 * Sortable table of qualifying skill efficacy rows.
 *
 * The baseline prop is accepted so callers can surface the comparison in a
 * header caption; Δ is already precomputed on each row so we do not recompute
 * here.
 */
export function SkillsEfficacyTable({
  rows,
  baseline,
}: {
  readonly rows: readonly SkillEfficacyRow[];
  readonly baseline: EfficacyBaseline;
}): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const active = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];

  const sorted = useMemo(() => {
    const next = [...rows];
    next.sort(active.compare);
    return next;
  }, [rows, active]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Sort by</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSortKey(s.key)}
              className={`control-chip${sortKey === s.key ? " is-active" : ""}`}
              aria-pressed={sortKey === s.key}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p
          className="text-[11px] text-muted"
          title={`baseline effective = ${formatPercent(baseline.effectiveScore)}`}
        >
          Baseline effective score:{" "}
          <span className="font-mono text-muted-strong">
            {formatPercent(baseline.effectiveScore)}
          </span>
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="glass-panel-soft rounded-sm p-6 text-center text-sm text-muted">
          No qualifying skills yet — need more scored sessions.
        </div>
      ) : (
        <div className="glass-panel overflow-x-auto rounded-md">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line/60 text-left">
                <Th>Skill</Th>
                <Th align="right">Sessions</Th>
                <Th align="right">Invocations</Th>
                <Th align="right">Satisfaction</Th>
                <Th align="right">Outcome mult.</Th>
                <Th align="right">Effective</Th>
                <Th align="right">Δ vs baseline</Th>
                <Th>Outcome mix</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <Row key={row.skillId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  readonly children: React.ReactNode;
  readonly align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      scope="col"
      className={`eyebrow px-3 py-2 font-semibold ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Row({ row }: { readonly row: SkillEfficacyRow }): JSX.Element {
  const deltaClass =
    row.delta > 0 ? "text-ok" : row.delta < 0 ? "text-danger" : "text-muted-strong";

  return (
    <tr className="border-b border-line/30 last:border-b-0 hover:bg-white/[0.02]">
      <td className="px-3 py-2 align-middle">
        <SkillLabel row={row} />
      </td>
      <td className="px-3 py-2 text-right align-middle font-mono text-xs text-muted-strong">
        {row.sessionsCount.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right align-middle font-mono text-xs text-muted-strong">
        {row.invocationsCount.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right align-middle font-mono text-xs text-muted-strong">
        {formatPercent(row.avgSatisfaction)}
      </td>
      <td className="px-3 py-2 text-right align-middle font-mono text-xs text-muted-strong">
        {formatPercent(row.avgOutcomeMultiplier)}
      </td>
      <td className="px-3 py-2 text-right align-middle font-mono text-xs text-ink">
        {formatPercent(row.avgEffectiveScore)}
      </td>
      <td
        className={`px-3 py-2 text-right align-middle font-mono text-xs font-semibold ${deltaClass}`}
      >
        {formatDelta(row.delta)}
      </td>
      <td className="px-3 py-2 align-middle">
        <OutcomeMix row={row} />
      </td>
    </tr>
  );
}

function SkillLabel({ row }: { readonly row: SkillEfficacyRow }): JSX.Element {
  const display = row.displayName || row.skillId;
  const className = "block max-w-[18rem] truncate text-sm text-ink";
  if (row.known) {
    return (
      <Link
        href={`/skills/${encodeURIComponent(row.skillId)}`}
        className={`${className} hover:text-cyan`}
        title={row.skillId}
      >
        {display}
      </Link>
    );
  }
  return (
    <span className={`${className} text-muted`} title={`${row.skillId} (unknown)`}>
      {display}
    </span>
  );
}

function OutcomeMix({ row }: { readonly row: SkillEfficacyRow }): JSX.Element {
  const total =
    row.outcomeBreakdown.completed +
    row.outcomeBreakdown.partial +
    row.outcomeBreakdown.abandoned +
    row.outcomeBreakdown.unknown;

  const segments: readonly {
    readonly outcome: SessionOutcome;
    readonly count: number;
  }[] = [
    { outcome: "completed", count: row.outcomeBreakdown.completed },
    { outcome: "partial", count: row.outcomeBreakdown.partial },
    { outcome: "abandoned", count: row.outcomeBreakdown.abandoned },
    { outcome: "unknown", count: row.outcomeBreakdown.unknown },
  ];

  const title = segments.map((s) => `${s.outcome}: ${s.count}`).join(" · ");

  if (total === 0) {
    return (
      <div
        className="h-2 w-[120px] rounded-full bg-white/[0.06]"
        aria-label="no outcome data"
        title="no outcome data"
      />
    );
  }

  return (
    <div
      className="flex h-2 w-[120px] overflow-hidden rounded-full bg-white/[0.06]"
      role="img"
      aria-label={`Outcome mix — ${title}`}
      title={title}
    >
      {segments.map((s) => {
        if (s.count === 0) return null;
        const pct = (s.count / total) * 100;
        return (
          <span
            key={s.outcome}
            className={`block h-full ${outcomeColor(s.outcome)}`}
            style={{ width: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}

"use client";

import { type JSX, useMemo } from "react";

import { formatDelta } from "./format-efficacy";

import type { SkillEfficacyRow } from "@/lib/skills-efficacy-source";

const MAX_CARDS = 8;

/**
 * Rule-based insight card per qualifying row.
 *
 * No LLM — the clauses are derived from a fixed set of booleans over each
 * row's delta / outcome breakdown / invocation density. We pick the top N
 * qualifying rows by |delta| so the highest-signal skills lead the section.
 */
export function SkillsEfficacyNarratives({
  rows,
}: {
  readonly rows: readonly SkillEfficacyRow[];
}): JSX.Element {
  const top = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return next.slice(0, MAX_CARDS);
  }, [rows]);

  if (top.length === 0) {
    return (
      <div className="glass-panel-soft rounded-sm p-6 text-center text-sm text-muted">
        No qualifying skills to narrate yet.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {top.map((row) => (
        <li key={row.skillId}>
          <NarrativeCard row={row} />
        </li>
      ))}
    </ul>
  );
}

function NarrativeCard({ row }: { readonly row: SkillEfficacyRow }): JSX.Element {
  const clauses = composeClauses(row);
  const display = row.displayName || row.skillId;

  const deltaClass =
    row.delta > 0 ? "text-ok" : row.delta < 0 ? "text-danger" : "text-muted-strong";

  return (
    <article className="glass-panel rounded-md p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Skill</p>
          <h4 className="mt-1 truncate text-base font-semibold text-ink" title={row.skillId}>
            {display}
          </h4>
        </div>
        <span className={`pill ${deltaClass}`} title={`Δ vs baseline: ${formatDelta(row.delta)}`}>
          Δ {formatDelta(row.delta)}
        </span>
      </header>
      {clauses.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm leading-6 text-muted-strong">
          {clauses.map((clause, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-muted/70" />
              <span>{clause}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No notable patterns for this skill.</p>
      )}
    </article>
  );
}

function composeClauses(row: SkillEfficacyRow): readonly string[] {
  const clauses: string[] = [];
  const sessions = row.sessionsCount > 0 ? row.sessionsCount : 1;
  const abandonedRatio = row.outcomeBreakdown.abandoned / sessions;
  const partialRatio = row.outcomeBreakdown.partial / sessions;
  const invocationsPerSession = row.invocationsCount / sessions;

  if (row.delta >= 0.05) {
    clauses.push(
      "Sessions using this skill score materially above baseline — keep the current integration."
    );
  } else if (row.delta <= -0.05) {
    clauses.push(
      "Sessions using this skill score below baseline; inspect the friction patterns below."
    );
  } else if (Math.abs(row.delta) < 0.05) {
    clauses.push("On-par with baseline; no statistical signal in either direction.");
  }

  if (abandonedRatio > 0.25) {
    clauses.push("Frequently abandoned (>25% of sessions) — reconsider invocation trigger.");
  }
  if (partialRatio > 0.3) {
    clauses.push("High rate of partial outcomes — skill may be leaving work unfinished.");
  }
  if (invocationsPerSession > 3) {
    clauses.push("Invoked multiple times per session — possibly redundant or chatty.");
  }
  if (!row.known) {
    clauses.push("Skill id not present in local catalogue — may be renamed or removed.");
  }

  return clauses;
}

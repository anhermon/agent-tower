"use client";

import type { JSX } from "react";
import type { SkillEfficacyRow } from "@/lib/skills-efficacy-source";

/**
 * Compact card listing skills excluded from scoring due to insufficient
 * sessions. Renders nothing when the list is empty so it never produces
 * dead whitespace in the composed dashboard.
 */
export function SkillsEfficacyInsufficient({
  rows,
  minSessions,
}: {
  readonly rows: readonly SkillEfficacyRow[];
  readonly minSessions: number;
}): JSX.Element | null {
  if (rows.length === 0) return null;

  return (
    <div className="glass-panel rounded-md p-5">
      <p className="eyebrow">Below scoring threshold</p>
      <p className="mt-2 text-sm text-muted">
        Fewer than {minSessions} sessions — excluded from scoring to avoid noise.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {rows.map((row) => (
          <li
            key={row.skillId}
            className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-muted"
            title={`${row.skillId} · ${row.sessionsCount} sessions`}
          >
            <span className="text-muted-strong">{row.displayName || row.skillId}</span>
            <span className="text-muted/70">× {row.sessionsCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

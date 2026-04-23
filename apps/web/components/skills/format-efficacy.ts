/**
 * Shared formatters and palette helpers for the Skill Efficacy dashboard.
 *
 * Pure, framework-agnostic, and safe to import from either server or client
 * components. Visual formatting only — do not put business logic here.
 */

import type { SessionOutcome } from "@/lib/skills-efficacy-source";

/**
 * Format a [0, 1] score as a percentage to one decimal place. Returns `"—"`
 * for non-finite/NaN so table cells never show "NaN%".
 */
export function formatPercent(score: number): string {
  if (!Number.isFinite(score)) return "—";
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Format a [-1, 1] delta as signed "percentage points". Uses the real minus
 * sign `−` (U+2212) for negatives so the output aligns with the report copy
 * and numerals render at consistent width.
 *
 * Examples: `+4.3 pp`, `−2.1 pp`, `0.0 pp`.
 */
export function formatDelta(delta: number): string {
  if (!Number.isFinite(delta)) return "—";
  const magnitude = Math.abs(delta) * 100;
  const rendered = magnitude.toFixed(1);
  if (delta > 0) return `+${rendered} pp`;
  if (delta < 0) return `−${rendered} pp`;
  return `0.0 pp`;
}

/**
 * Tailwind class suggestion for a session-outcome segment fill.
 *
 * The palette (see `app/globals.css` + `tailwind.config.ts`) exposes `ok`,
 * `warn`, `danger`, and `muted` — there is no `success` token — so we map
 * onto the real keys:
 *   - completed → bg-ok/70
 *   - partial   → bg-warn/70
 *   - abandoned → bg-danger/70
 *   - unknown   → bg-muted/40
 */
export function outcomeColor(outcome: SessionOutcome): string {
  switch (outcome) {
    case "completed":
      return "bg-ok/70";
    case "partial":
      return "bg-warn/70";
    case "abandoned":
      return "bg-danger/70";
    default:
      return "bg-muted/40";
  }
}

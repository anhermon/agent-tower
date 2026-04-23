/**
 * Shared formatters for the Skills usage dashboard components.
 *
 * These helpers are pure, framework-agnostic, and safe to import from either
 * server or client components. Visual formatting only — do not put business
 * logic here.
 */

/**
 * Format a token count as a short human-readable string.
 *
 * - Exact integer rendering for values below 1,000.
 * - `3.2k`, `12k`, `842k` for thousands (1 decimal under 10k).
 * - `1.4M`, `21M` for millions.
 * - `1.2B` for billions (unlikely but kept for safety).
 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n < 1_000_000_000) return `${Math.round(n / 1_000_000)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

/**
 * Format a raw byte count as `1.2 KB`, `3.4 MB`, etc. Falls back to `—` when
 * the input is non-finite or negative.
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format an ISO timestamp as a `YYYY-MM-DD` short date. Returns `—` for null
 * or unparseable input. Uses UTC slicing so the output is stable regardless
 * of the viewer's timezone.
 */
export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

/**
 * Safe integer max of a numeric array, defaulting to `0` for empty input.
 * Negative counts collapse to 0 (we only chart non-negative counts).
 */
export function maxCount(values: readonly number[]): number {
  let max = 0;
  for (const v of values) {
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

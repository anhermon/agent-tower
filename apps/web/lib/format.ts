export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return "—";
  const deltaSeconds = Math.round((now.getTime() - then.getTime()) / 1000);
  const abs = Math.abs(deltaSeconds);
  if (abs < 1) return "just now";
  const past = deltaSeconds >= 0;
  const buckets: { limit: number; divisor: number; unit: string }[] = [
    { limit: 60, divisor: 1, unit: "s" },
    { limit: 3600, divisor: 60, unit: "m" },
    { limit: 86400, divisor: 3600, unit: "h" },
    { limit: 86400 * 30, divisor: 86400, unit: "d" },
    { limit: 86400 * 365, divisor: 86400 * 30, unit: "mo" },
  ];
  for (const bucket of buckets) {
    if (abs < bucket.limit) {
      const value = Math.max(1, Math.floor(abs / bucket.divisor));
      return past ? `${value}${bucket.unit} ago` : `in ${value}${bucket.unit}`;
    }
  }
  const years = Math.max(1, Math.floor(abs / (86400 * 365)));
  return past ? `${years}y ago` : `in ${years}y`;
}

export function truncateMiddle(value: string, max = 16): string {
  if (value.length <= max) return value;
  const keep = Math.max(2, Math.floor((max - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

// ─── Phase 1 Wave 1: analytics formatters ────────────────────────────────────
// Mirror cc-lens `lib/decode.ts` + `lib/utils.ts` semantics. All helpers return
// "—" for non-finite or NaN inputs rather than throwing or printing "NaN".

/**
 * Compact integer notation for token counts. Examples:
 *   0 → "0", 999 → "999", 1234 → "1.2k", 3_400_000 → "3.4M",
 *   2_500_000_000 → "2.5B". Negative values render as "-1.2k".
 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1_000) return `${sign}${Math.trunc(abs)}`;
  if (abs < 1_000_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  if (abs < 1_000_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
}

/**
 * USD cost formatter. Sub-cent precision for tiny amounts, standard dollar
 * precision below $1k, compact notation above. Examples:
 *   0.0041 → "$0.0041", 0.42 → "$0.42", 12.34 → "$12.34",
 *   1234 → "$1.2k", 2_500_000 → "$2.5M".
 */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd)) return "—";
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) return `${sign}$${abs.toFixed(4)}`;
  if (abs < 1_000) return `${sign}$${abs.toFixed(2)}`;
  if (abs < 1_000_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
}

/**
 * Human-readable duration from milliseconds. Examples:
 *   0 → "0s", 12_000 → "12s", 194_000 → "3m 14s", 3_720_000 → "1h 02m".
 * Negative inputs are treated as zero. Sub-second precision is deliberately
 * collapsed to "0s" — callers that need ms granularity should not use this.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const abs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(abs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/**
 * Percentage formatter with 0.1% precision. Input is a ratio (0..1), not a
 * percentage. Examples: 0 → "0.0%", 0.1234 → "12.3%", 1 → "100.0%".
 */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

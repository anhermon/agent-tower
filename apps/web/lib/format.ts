export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "—";
  const deltaSeconds = Math.round((now.getTime() - then.getTime()) / 1000);
  const abs = Math.abs(deltaSeconds);
  const past = deltaSeconds >= 0;
  const buckets: Array<{ limit: number; divisor: number; unit: string }> = [
    { limit: 60, divisor: 1, unit: "s" },
    { limit: 3600, divisor: 60, unit: "m" },
    { limit: 86400, divisor: 3600, unit: "h" },
    { limit: 86400 * 30, divisor: 86400, unit: "d" },
    { limit: 86400 * 365, divisor: 86400 * 30, unit: "mo" }
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

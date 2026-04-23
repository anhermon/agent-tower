/**
 * Pure, server-safe helpers used by the server components that read the
 * date-range search params. Keeps the `"use client"` split clean: the
 * picker UI ships to the browser, this helper stays server-side.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIsoDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number): Date {
  const today = startOfDay(new Date());
  const d = new Date(today);
  d.setDate(today.getDate() - (n - 1));
  return d;
}

/**
 * Resolve `?from=YYYY-MM-DD&to=YYYY-MM-DD` or `?preset=7d|30d|90d` into a
 * canonical `DateRange`. Returns `undefined` when nothing matches.
 */
export function resolveRangeFromSearchParams(
  sp: Readonly<Record<string, string | string[] | undefined>>
): { readonly from: string; readonly to: string } | undefined {
  const fromRaw = typeof sp.from === "string" ? sp.from : undefined;
  const toRaw = typeof sp.to === "string" ? sp.to : undefined;
  const from = parseIsoDate(fromRaw ?? null);
  const to = parseIsoDate(toRaw ?? null);
  if (from && to) return { from: toIsoDate(from), to: toIsoDate(to) };

  const preset = typeof sp.preset === "string" ? sp.preset : undefined;
  if (preset === "7d" || preset === "30d" || preset === "90d") {
    const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
    const today = startOfDay(new Date());
    const start = daysAgo(days);
    return { from: toIsoDate(start), to: toIsoDate(today) };
  }
  return undefined;
}

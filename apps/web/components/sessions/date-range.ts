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

function presetDays(preset: "7d" | "30d" | "90d"): number {
  if (preset === "7d") return 7;
  if (preset === "30d") return 30;
  return 90;
}

function resolvePresetRange(preset: "7d" | "30d" | "90d"): {
  readonly from: string;
  readonly to: string;
} {
  const today = startOfDay(new Date());
  const start = daysAgo(presetDays(preset));
  return { from: toIsoDate(start), to: toIsoDate(today) };
}

type Preset = "7d" | "30d" | "90d";
const VALID_PRESETS: readonly string[] = ["7d", "30d", "90d"];

function getStringParam(
  sp: Readonly<Record<string, string | string[] | undefined>>,
  key: string
): string | undefined {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

function resolveExplicitRange(
  sp: Readonly<Record<string, string | string[] | undefined>>
): { readonly from: string; readonly to: string } | undefined {
  const from = parseIsoDate(getStringParam(sp, "from") ?? null);
  const to = parseIsoDate(getStringParam(sp, "to") ?? null);
  if (from && to) return { from: toIsoDate(from), to: toIsoDate(to) };
  return undefined;
}

/**
 * Resolve `?from=YYYY-MM-DD&to=YYYY-MM-DD` or `?preset=7d|30d|90d` into a
 * canonical `DateRange`. Returns `undefined` when nothing matches.
 */
export function resolveRangeFromSearchParams(
  sp: Readonly<Record<string, string | string[] | undefined>>
): { readonly from: string; readonly to: string } | undefined {
  const explicit = resolveExplicitRange(sp);
  if (explicit) return explicit;

  const preset = getStringParam(sp, "preset");
  if (preset && VALID_PRESETS.includes(preset)) {
    return resolvePresetRange(preset as Preset);
  }
  return undefined;
}

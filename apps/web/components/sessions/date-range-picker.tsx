"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { cn } from "@/lib/utils";

// Lazy boundary: `react-day-picker` (~25-30 kB gz) is only needed when the
// popover opens. `ssr: false` is legal here because the file is `"use client"`.
// The stylesheet is loaded via a side-effect dynamic import inside a
// `useEffect` on first open (option "b"), so neither the JS nor the CSS ships
// on First-Load for any route that renders this control.
const LazyDayPicker = dynamic(() => import("react-day-picker").then((m) => m.DayPicker), {
  ssr: false,
  loading: () => (
    <div
      aria-busy="true"
      aria-label="Calendar loading"
      className="h-72 w-72 animate-pulse rounded bg-white/[0.03]"
    />
  ),
});

type Preset = "7d" | "30d" | "90d" | "custom";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local-TZ YYYY-MM-DD for a Date; avoids UTC-shift surprises at day boundary. */
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

function formatShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * URL-driven date-range control. Updates `?from=YYYY-MM-DD&to=YYYY-MM-DD` on
 * every change; the server component reads them and re-fetches. Never uses
 * localStorage.
 */
export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useSearchParams();

  const fromParam = parseIsoDate(params?.get("from") ?? null);
  const toParam = parseIsoDate(params?.get("to") ?? null);

  const currentPreset: Preset = useMemo(() => {
    if (fromParam && toParam) return "custom";
    const explicit = params?.get("preset") as Preset | null;
    if (explicit === "7d" || explicit === "30d" || explicit === "90d") return explicit;
    return "30d";
  }, [fromParam, toParam, params]);

  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DayPickerRange | undefined>(
    fromParam && toParam ? { from: fromParam, to: toParam } : undefined
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const cssLoadedRef = useRef(false);

  // Load `react-day-picker`'s stylesheet only once, the first time the popover
  // is opened. Keeps the ~few-KB CSS out of the initial document for pages
  // that never use the custom range.
  useEffect(() => {
    if (!open || cssLoadedRef.current) return;
    cssLoadedRef.current = true;
    void import("react-day-picker/style.css");
  }, [open]);

  // Close the popover on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function applyPreset(preset: Exclude<Preset, "custom">) {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete("from");
    next.delete("to");
    next.set("preset", preset);
    router.push(`${pathname}?${next.toString()}`);
    setRange(undefined);
  }

  function applyCustomRange(from: Date, to: Date) {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete("preset");
    next.set("from", toIsoDate(from));
    next.set("to", toIsoDate(to));
    router.push(`${pathname}?${next.toString()}`);
  }

  const presetButton = (preset: Exclude<Preset, "custom">) => (
    <button
      key={preset}
      type="button"
      onClick={() => applyPreset(preset)}
      aria-pressed={currentPreset === preset}
      className={cn(
        "rounded-xs px-2.5 py-1 text-xs font-semibold transition-colors",
        currentPreset === preset ? "bg-accent/15 text-ink" : "text-muted hover:text-ink"
      )}
    >
      {preset}
    </button>
  );

  const label =
    currentPreset === "custom" && range?.from && range.to
      ? `${formatShort(range.from)} – ${formatShort(range.to)}`
      : "Pick dates";

  return (
    <div className="flex items-center gap-2" ref={rootRef}>
      <div className="inline-flex items-center gap-1 rounded-xs border border-line/60 bg-panel/40 p-1">
        {presetButton("7d")}
        {presetButton("30d")}
        {presetButton("90d")}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "inline-flex items-center gap-2 rounded-xs border px-2.5 py-1 text-xs font-semibold transition-colors",
            currentPreset === "custom"
              ? "border-accent/40 bg-accent/10 text-ink"
              : "border-line/60 text-muted hover:text-ink"
          )}
        >
          <svg
            aria-hidden
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {label}
        </button>
        {open ? (
          <div
            role="dialog"
            aria-label="Select date range"
            className="absolute right-0 top-full z-50 mt-2 rounded-md border border-line/70 bg-panel p-2 shadow-glass"
          >
            <LazyDayPicker
              mode="range"
              selected={range}
              onSelect={(next) => {
                setRange(next);
                if (next?.from && next.to) {
                  applyCustomRange(next.from, next.to);
                  setOpen(false);
                }
              }}
              disabled={{ after: new Date() }}
              defaultMonth={range?.from ?? daysAgo(30)}
              classNames={{
                today: "rdp-today",
                selected: "rdp-selected",
                range_start: "rdp-range_start",
                range_middle: "rdp-range_middle",
                range_end: "rdp-range_end",
              }}
              styles={{
                caption: { color: "rgb(var(--color-ink))" },
                head: { color: "rgb(var(--color-muted))" },
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

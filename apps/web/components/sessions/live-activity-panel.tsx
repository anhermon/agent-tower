"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  SessionDerivedFlags,
  SessionLiveEvent,
  SessionLiveSnapshot,
} from "@control-plane/core";

import { EmptyState } from "@/components/ui/state";
import { formatCost, formatDuration, formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Client-side Live Activity panel.
 *
 * Subscribes to `/api/events` over EventSource, parses each SSE data frame as
 * an `EventEnvelope`, and renders the latest 20 sessions that fired events.
 * Event frames are best-effort enriched with a `SessionLiveSnapshot` server-
 * side — the renderer tolerates missing fields and never crashes on malformed
 * payloads (failed parses are silently dropped).
 */

type ConnectionState = "connecting" | "listening" | "reconnecting";

interface EventEnvelope {
  readonly event: SessionLiveEvent;
}

const MAX_EVENTS = 20;

export interface LiveActivityPanelProps {
  readonly className?: string;
}

export function LiveActivityPanel({ className }: LiveActivityPanelProps) {
  const [events, setEvents] = useState<readonly SessionLiveEvent[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    const source = new EventSource("/api/events");
    sourceRef.current = source;

    source.onopen = () => {
      if (cancelled) return;
      setConnection("listening");
    };

    source.onmessage = (message) => {
      if (cancelled) return;
      const event = safeParseEventEnvelope(message.data);
      if (!event) return;
      setEvents((prior) => prependEvent(prior, event));
    };

    source.onerror = () => {
      if (cancelled) return;
      // EventSource auto-reconnects on `error`; surface the transient state.
      setConnection((prev) => (prev === "listening" ? "reconnecting" : prev));
    };

    return () => {
      cancelled = true;
      source.close();
      sourceRef.current = null;
    };
  }, []);

  return (
    <section className={cn("glass-panel rounded-md", className)}>
      <div className="flex h-14 items-center justify-between border-b border-line/60 px-5">
        <div>
          <p className="eyebrow">Event stream</p>
          <h2 className="text-sm font-semibold text-ink">Live Activity</h2>
        </div>
        <ConnectionPill state={connection} />
      </div>
      {events.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="Waiting for session activity"
            description="Listening for Claude Code transcript writes. Start or resume a session to populate this stream."
          />
        </div>
      ) : (
        <ul className="divide-y divide-line/60">
          {events.map((event) => (
            <li key={`${event.sessionId}-${event.occurredAt}-${event.type}`}>
              <LiveEventRow event={event} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConnectionPill({ state }: { readonly state: ConnectionState }) {
  const label =
    state === "listening" ? "Listening" : state === "reconnecting" ? "Reconnecting" : "Connecting";
  const tone =
    state === "listening"
      ? "bg-ok/15 text-ok"
      : state === "reconnecting"
        ? "bg-warn/15 text-warn"
        : "bg-info/15 text-info";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        tone
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function liveEventBadgeClass(type: SessionLiveEvent["type"]): string {
  return type === "session-created" ? "bg-ok/15 text-ok" : "bg-info/15 text-info";
}

function liveEventTypeLabel(type: SessionLiveEvent["type"]): string {
  return type === "session-created" ? "created" : "appended";
}

function LiveEventRow({ event }: { readonly event: SessionLiveEvent }) {
  const snapshot = event.snapshot;
  const href = `/sessions/${encodeURIComponent(event.sessionId)}`;
  const timeLabel = formatUtcClock(event.occurredAt);
  const typeClass = liveEventBadgeClass(event.type);
  const typeLabel = liveEventTypeLabel(event.type);

  return (
    <Link
      href={href}
      className="block px-5 py-4 transition-colors hover:bg-line/20 focus:bg-line/20 focus:outline-none"
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className={cn(
            "inline-flex items-center rounded-xs px-1.5 py-0.5 font-mono uppercase tracking-wide",
            typeClass
          )}
        >
          {typeLabel}
        </span>
        <span className="font-mono text-muted">{timeLabel}</span>
        {snapshot?.model ? (
          <span className="truncate font-mono text-muted" title={snapshot.model}>
            {snapshot.model}
          </span>
        ) : null}
        <span className="ml-auto truncate font-mono text-muted" title={event.projectSlug}>
          {event.projectSlug}
        </span>
      </div>
      <SnapshotDetails snapshot={snapshot} fallbackId={event.sessionId} />
    </Link>
  );
}

function SnapshotDetails({
  snapshot,
  fallbackId,
}: {
  readonly snapshot: SessionLiveSnapshot | undefined;
  readonly fallbackId: string;
}) {
  return (
    <>
      <p
        className={cn(
          "mt-1.5 truncate text-sm",
          snapshot?.title ? "text-ink" : "font-mono text-muted"
        )}
      >
        {snapshot?.title ?? fallbackId}
      </p>
      {snapshot ? <MetricsRow snapshot={snapshot} /> : null}
      {snapshot ? (
        <FlagChips flags={snapshot.flags} subagentCount={snapshot.subagentCount} />
      ) : null}
      {snapshot?.tail ? <TailExcerpt tail={snapshot.tail} /> : null}
    </>
  );
}

function MetricsRow({ snapshot }: { readonly snapshot: SessionLiveSnapshot }) {
  const entries = useMemo(() => buildMetricEntries(snapshot), [snapshot]);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
      {entries.map((entry) => (
        <div className="flex items-center gap-1" key={entry.label}>
          <dt className="uppercase tracking-wide">{entry.label}</dt>
          <dd className="text-ink">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface MetricEntry {
  readonly label: string;
  readonly value: string;
}

function addTokenMetric(entries: MetricEntry[], snapshot: SessionLiveSnapshot): void {
  const tokensIn =
    (snapshot.inputTokens ?? 0) +
    (snapshot.cacheReadTokens ?? 0) +
    (snapshot.cacheCreationTokens ?? 0);
  const tokensOut = snapshot.outputTokens ?? 0;
  if (tokensIn > 0 || tokensOut > 0) {
    entries.push({
      label: "tokens",
      value: `${formatTokens(tokensIn)} → ${formatTokens(tokensOut)}`,
    });
  }
}

function addNumericMetric(
  entries: MetricEntry[],
  value: number | undefined,
  label: string,
  format: (n: number) => string
): void {
  if (typeof value === "number" && value > 0) {
    entries.push({ label, value: format(value) });
  }
}

function buildMetricEntries(snapshot: SessionLiveSnapshot): readonly MetricEntry[] {
  const entries: MetricEntry[] = [];
  addTokenMetric(entries, snapshot);
  addNumericMetric(entries, snapshot.turns, "turns", (n) => n.toLocaleString());
  addNumericMetric(entries, snapshot.toolCallCount, "tools", (n) => n.toLocaleString());
  if (typeof snapshot.contextPercent === "number" && snapshot.contextPercent > 0) {
    entries.push({ label: "ctx", value: `${Math.round(snapshot.contextPercent * 100)}%` });
  }
  addNumericMetric(entries, snapshot.estimatedCostUsd, "cost", formatCost);
  addNumericMetric(entries, snapshot.durationMs, "dur", formatDuration);
  return entries;
}

interface FlagChipDef {
  readonly key: keyof SessionDerivedFlags;
  readonly label: string;
  readonly tone: string;
}

const FLAG_CHIPS: readonly FlagChipDef[] = [
  {
    key: "hasCompaction",
    label: "compact",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  {
    key: "hasThinking",
    label: "think",
    tone: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  },
  { key: "usesMcp", label: "mcp", tone: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  {
    key: "usesWebSearch",
    label: "websearch",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  {
    key: "usesWebFetch",
    label: "webfetch",
    tone: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
];

function FlagChips({
  flags,
  subagentCount,
}: {
  readonly flags: SessionDerivedFlags | undefined;
  readonly subagentCount: number | undefined;
}) {
  const active = flags ? FLAG_CHIPS.filter((chip) => flags[chip.key]) : [];
  const showAgents = typeof subagentCount === "number" && subagentCount > 0;
  if (active.length === 0 && !showAgents) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {active.map((chip) => (
        <span
          key={chip.key}
          className={cn(
            "inline-flex h-[18px] shrink-0 items-center rounded-sm border px-1.5 font-mono text-[10px] uppercase tracking-wide",
            chip.tone
          )}
        >
          {chip.label}
        </span>
      ))}
      {showAgents ? (
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-sm border border-violet-500/30 bg-violet-500/10 px-1.5 font-mono text-[10px] uppercase tracking-wide text-violet-300">
          agents ×{subagentCount}
        </span>
      ) : null}
    </div>
  );
}

function TailExcerpt({ tail }: { readonly tail: NonNullable<SessionLiveSnapshot["tail"]> }) {
  return (
    <div className="mt-2 rounded-xs bg-line/20 px-2.5 py-1.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{tail.role}</p>
      <p className="line-clamp-2 text-xs leading-5 text-ink/90">{tail.text}</p>
    </div>
  );
}

function formatUtcClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function prependEvent(
  prior: readonly SessionLiveEvent[],
  event: SessionLiveEvent
): readonly SessionLiveEvent[] {
  const next = [event, ...prior];
  return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
}

function safeParseEventEnvelope(raw: unknown): SessionLiveEvent | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isLiveEventEnvelope(parsed)) return null;
  if (!isSessionLiveEvent(parsed.event)) return null;
  return parsed.event;
}

function isLiveEventEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== "object" || value === null || !("event" in value)) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.event === "object";
}

function isSessionLiveEvent(value: unknown): value is SessionLiveEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type !== "session-created" && v.type !== "session-appended") return false;
  if (typeof v.sessionId !== "string" || v.sessionId.length === 0) return false;
  if (typeof v.projectSlug !== "string") return false;
  if (typeof v.occurredAt !== "string") return false;
  return true;
}

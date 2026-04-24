"use client";

import { useState } from "react";

import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ProcessingTimeline } from "./processing-timeline";

import type { ObservedWebhookEvent, WebhookEventStatus } from "../types";

interface EventDetailPanelProps {
  readonly event: ObservedWebhookEvent | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

function XIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <line x1={18} x2={6} y1={6} y2={18} />
      <line x1={6} x2={18} y1={6} y2={18} />
    </svg>
  );
}

function StatusBadge({ status }: { readonly status: WebhookEventStatus }) {
  const tone =
    status === "failed" || status === "dlq"
      ? "text-danger"
      : status === "processing" || status === "queued"
        ? "text-warn"
        : status === "triggered"
          ? "text-info"
          : "text-ok";
  return <span className={cn("pill px-3 py-1.5 text-sm", tone)}>{status}</span>;
}

function EventPanelHeader({
  event,
  onClose,
}: {
  readonly event: ObservedWebhookEvent | null;
  readonly onClose: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line/80 p-5">
      <div className="min-w-0">
        <p className="eyebrow">Event</p>
        <h2 className="mt-1 truncate text-lg font-semibold text-ink">
          {event?.eventLabel ?? "Event Detail"}
        </h2>
        {event && (
          <p className="mt-1 text-sm text-muted">
            #{event.targetLabel} · {event.providerLabel} · {formatRelative(event.receivedAt)}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ink/[0.05] hover:text-ink"
        aria-label="Close panel"
      >
        <XIcon className="h-5 w-5" />
      </button>
    </header>
  );
}

function EventPanelContent({ event }: { readonly event: ObservedWebhookEvent }) {
  const [showFullPayload, setShowFullPayload] = useState(false);

  const payloadText = JSON.stringify(event.payload, null, 2);
  const payloadLines = payloadText.split("\n");
  const previewLines = payloadLines.slice(0, 10);
  const isTruncated = payloadLines.length > 10;

  const isActive =
    event.status === "processing" ||
    event.timeline.some((s) => s.step === "processing" && s.status === "pending");

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center gap-3">
        <StatusBadge status={event.status} />
        <span className="text-sm text-muted">{event.providerLabel}</span>
      </div>

      {/* Processing Timeline */}
      <section>
        <h3 className="eyebrow mb-3">Processing Timeline</h3>
        <div className="glass-panel rounded-lg p-4">
          <ProcessingTimeline
            steps={event.timeline}
            isActive={isActive}
            processingMs={event.processingMs}
          />
        </div>
      </section>

      {/* Payload Preview */}
      <section>
        <h3 className="eyebrow mb-3">Payload Preview</h3>
        <div className="glass-panel rounded-lg p-4">
          <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-ink">
            <code>
              {(showFullPayload ? payloadLines : previewLines).join("\n")}
              {!showFullPayload && isTruncated && "\n..."}
            </code>
          </pre>
          {isTruncated && (
            <button
              onClick={() => setShowFullPayload((prev) => !prev)}
              className="mt-3 text-xs text-info hover:underline"
            >
              {showFullPayload ? "Show less" : "View full JSON"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function EventDetailPanel({ event, isOpen, onClose }: EventDetailPanelProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line shadow-glass",
          "bg-panel/95 backdrop-blur-glass",
          "sm:w-[420px]"
        )}
        role="dialog"
        aria-modal="true"
      >
        <EventPanelHeader event={event} onClose={onClose} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {!event ? (
            <div className="rounded-xs border border-dashed border-line/80 bg-ink/[0.02] p-6 text-center text-sm text-muted">
              Select an event to view details.
            </div>
          ) : (
            <EventPanelContent event={event} />
          )}
        </div>
      </aside>
    </>
  );
}

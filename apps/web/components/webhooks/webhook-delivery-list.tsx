import Link from "next/link";

import type { WebhookDelivery } from "@control-plane/core";

import { formatRelative } from "@/lib/format";

interface WebhookDeliveryListProps {
  readonly deliveries: readonly WebhookDelivery[];
}

const STATUS_LABELS: Record<WebhookDelivery["status"], string> = {
  pending: "Pending",
  delivered: "Delivered",
  failed: "Failed",
};

const STATUS_TONES: Record<WebhookDelivery["status"], string> = {
  pending: "text-info",
  delivered: "text-ok",
  failed: "text-danger",
};

export function WebhookDeliveryList({ deliveries }: WebhookDeliveryListProps) {
  if (deliveries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line/70 bg-white/[0.02] p-6 text-center text-sm text-muted">
        No webhook invocations recorded yet.
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden rounded-md">
      <ul className="divide-y divide-line/60">
        {deliveries.map((delivery) => {
          const sessionId = deliverySessionId(delivery);
          return (
            <li key={delivery.id} className="flex items-start gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-ink">{delivery.eventType}</p>
                <p className="mt-1 truncate font-mono text-xs text-muted">{delivery.id}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-mono">subscription: {delivery.subscriptionId}</span>
                  {sessionId ? (
                    <Link
                      href={`/sessions/${encodeURIComponent(sessionId)}`}
                      className="font-mono text-cyan hover:underline"
                    >
                      session: {sessionId}
                    </Link>
                  ) : (
                    <span className="font-mono text-muted/80">session: —</span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                <div className={STATUS_TONES[delivery.status]}>
                  {STATUS_LABELS[delivery.status]}
                  {typeof delivery.responseStatus === "number"
                    ? ` · ${delivery.responseStatus}`
                    : ""}
                </div>
                <div className="mt-1 text-muted/80">{formatRelative(delivery.attemptedAt)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function deliverySessionId(delivery: WebhookDelivery): string | null {
  const metadata = delivery.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const candidate = metadata.sessionId;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

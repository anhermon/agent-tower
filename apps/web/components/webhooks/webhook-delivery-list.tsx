import type { WebhookDelivery } from "@control-plane/core";
import { formatRelative } from "@/lib/format";

type WebhookDeliveryListProps = {
  readonly deliveries: readonly WebhookDelivery[];
};

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
        No deliveries recorded yet. Live delivery tracking requires the inbound webhook pipeline,
        which is deferred past Phase 2 v1.
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden rounded-md">
      <ul role="list" className="divide-y divide-line/60">
        {deliveries.map((delivery) => (
          <li key={delivery.id} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm text-ink">{delivery.eventType}</p>
              <p className="mt-1 truncate font-mono text-xs text-muted">{delivery.id}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-muted">
              <div className={STATUS_TONES[delivery.status]}>
                {STATUS_LABELS[delivery.status]}
                {typeof delivery.responseStatus === "number" ? ` · ${delivery.responseStatus}` : ""}
              </div>
              <div className="mt-1 text-muted/80">{formatRelative(delivery.attemptedAt)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

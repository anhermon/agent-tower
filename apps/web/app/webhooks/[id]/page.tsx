import Link from "next/link";

import { EmptyState, ErrorState } from "@/components/ui/state";
import { WebhookDeliveryList } from "@/components/webhooks/webhook-delivery-list";
import { WebhookSecretBanner } from "@/components/webhooks/webhook-secret-banner";
import { subscriptionStatus, WebhookStatusBadge } from "@/components/webhooks/webhook-status-badge";
import { formatRelative } from "@/lib/format";
import { loadWebhookOrUndefined, WEBHOOKS_FILE_ENV } from "@/lib/webhooks-source";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WebhookDetailPage({ params }: PageProps) {
  const { id } = await params;
  const decodedId = safeDecode(id);
  const result = await loadWebhookOrUndefined(decodedId);

  if (!result.ok) {
    return (
      <section className="space-y-5">
        <Link href="/webhooks" className="text-sm text-cyan hover:underline">
          ← Back to webhooks
        </Link>
        {result.reason === "unconfigured" ? (
          <EmptyState
            title="Webhooks are not configured"
            description={`Set ${WEBHOOKS_FILE_ENV} to the absolute path of a JSON file containing WebhookSubscription entries.`}
          />
        ) : result.reason === "not_found" ? (
          <EmptyState
            title="Webhook subscription not found"
            description={`No subscription with id ${decodedId} was found in the configured source file.`}
          />
        ) : (
          <ErrorState
            title="Could not load webhook"
            description={
              result.message ?? `An unknown error occurred reading ${WEBHOOKS_FILE_ENV}.`
            }
          />
        )}
      </section>
    );
  }

  const { listing, deliveries, sourceFile } = result;
  const { subscription } = listing;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/webhooks" className="text-cyan hover:underline">
          ← Back to webhooks
        </Link>
        <span className="font-mono text-xs text-muted" title={subscription.id}>
          {subscription.id}
        </span>
      </div>

      <header className="glass-panel relative overflow-hidden rounded-lg p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Webhook subscription</p>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-ink md:text-[28px]">
              {subscription.displayName ?? subscription.id}
            </h1>
            <p className="mt-2 break-all font-mono text-xs text-ink">{subscription.url}</p>
          </div>
          <WebhookStatusBadge status={subscriptionStatus(subscription.enabled)} />
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Subscription id" value={subscription.id} mono />
          <Stat label="Enabled" value={subscription.enabled ? "yes" : "no"} />
          <Stat
            label="Created"
            value={formatRelative(subscription.createdAt)}
            hint={subscription.createdAt}
          />
          <Stat
            label="Last delivery"
            value={listing.lastDeliveryAt ? formatRelative(listing.lastDeliveryAt) : "—"}
            hint={listing.lastDeliveryAt ?? "no deliveries yet"}
          />
        </dl>

        <div className="relative mt-5">
          <p className="eyebrow">Events subscribed</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {subscription.eventTypes.map((eventType) => (
              <span
                key={eventType}
                className="inline-flex items-center rounded-full border border-line/80 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-muted"
              >
                {eventType}
              </span>
            ))}
          </div>
        </div>

        <p className="relative mt-5 font-mono text-[11px] text-muted/80" title={sourceFile}>
          source: {sourceFile}
        </p>
      </header>

      <WebhookSecretBanner secretRef={subscription.secretRef} />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="eyebrow">Deliveries</p>
            <h2 className="text-base font-semibold text-ink">Recent attempts</h2>
          </div>
          <p className="text-xs text-muted">Invocation log from the inbound GitHub receiver.</p>
        </div>
        <WebhookDeliveryList deliveries={deliveries} />
      </div>
    </section>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function Stat({
  label,
  value,
  hint,
  mono,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="glass-panel-soft rounded-xs p-3">
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 text-sm text-ink ${mono ? "break-all font-mono text-xs" : ""}`}>
        {value}
        {hint ? <span className="ml-2 font-mono text-xs text-muted/80">{hint}</span> : null}
      </dd>
    </div>
  );
}

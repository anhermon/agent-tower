import Link from "next/link";

import { subscriptionStatus, WebhookStatusBadge } from "@/components/webhooks/webhook-status-badge";
import { formatRelative, truncateMiddle } from "@/lib/format";

import type { WebhookSubscriptionListing } from "@/lib/webhooks-source";

interface WebhookTableProps {
  readonly listings: readonly WebhookSubscriptionListing[];
}

export function WebhookTable({ listings }: WebhookTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-control">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse text-left text-sm">
          <thead className="bg-soft text-xs uppercase text-muted">
            <tr>
              <th scope="col" className="w-56 px-4 py-3 font-semibold">
                Name
              </th>
              <th scope="col" className="min-w-64 px-4 py-3 font-semibold">
                Target URL
              </th>
              <th scope="col" className="w-64 px-4 py-3 font-semibold">
                Events
              </th>
              <th scope="col" className="w-28 px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="w-40 px-4 py-3 font-semibold">
                Last delivery
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {listings.map((listing) => {
              const { subscription } = listing;
              const href = `/webhooks/${encodeURIComponent(subscription.id)}`;
              return (
                <tr key={subscription.id} className="hover:bg-soft">
                  <td className="px-4 py-4 align-top">
                    <Link href={href} className="block font-medium text-ink hover:text-cyan">
                      {subscription.displayName ?? subscription.id}
                    </Link>
                    <span
                      className="mt-1 block font-mono text-xs text-muted"
                      title={subscription.id}
                    >
                      {subscription.id}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span
                      className="block truncate font-mono text-xs text-ink"
                      title={subscription.url}
                    >
                      {truncateMiddle(subscription.url, 60)}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <ul className="flex flex-wrap gap-1.5">
                      {subscription.eventTypes.map((eventType) => (
                        <li
                          key={eventType}
                          className="inline-flex items-center rounded-full border border-line/70 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-muted"
                        >
                          {eventType}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <WebhookStatusBadge status={subscriptionStatus(subscription.enabled)} />
                  </td>
                  <td className="px-4 py-4 align-top text-xs text-muted">
                    {listing.lastDeliveryAt ? (
                      <>
                        <span className="text-ink">{formatRelative(listing.lastDeliveryAt)}</span>
                        <span className="ml-2 font-mono text-muted/80">
                          {listing.lastDeliveryAt}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

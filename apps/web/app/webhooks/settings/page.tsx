import Link from "next/link";

import { EmptyState } from "@/components/ui/state";
import { listWebhooksOrEmpty, WEBHOOKS_FILE_ENV } from "@/lib/webhooks-source";

import { WebhookSettingsClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function WebhookSettingsPage() {
  const result = await listWebhooksOrEmpty();

  const subscriptions = result.ok
    ? result.snapshot.subscriptions.map((listing) => listing.subscription)
    : [];

  const isUnconfigured = !result.ok && result.reason === "unconfigured";

  return (
    <section className="space-y-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link href="/webhooks" className="hover:text-ink">
              Webhooks
            </Link>
            <span>/</span>
            <span className="text-ink">Settings</span>
          </nav>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink">Webhook settings</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Register, update, and deregister webhook subscriptions. Subscriptions are persisted to
            the JSON file at <code>{WEBHOOKS_FILE_ENV}</code>.
          </p>
        </div>
      </div>

      {isUnconfigured ? (
        <EmptyState
          title="Webhooks file not configured"
          description={`Set ${WEBHOOKS_FILE_ENV} to the absolute path of a JSON file. It will be created automatically when you register the first subscription.`}
        />
      ) : (
        <WebhookSettingsClient initialSubscriptions={subscriptions} />
      )}
    </section>
  );
}

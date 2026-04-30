import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { RefreshButton } from "@/components/ui/refresh-button";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { WebhookSessionsPanel } from "@/components/webhooks/webhook-sessions-panel";
import { WebhookTable } from "@/components/webhooks/webhook-table";
import { getModuleByKey } from "@/lib/modules";
import { listWebhookSessions } from "@/lib/webhook-session-store";
import {
  getConfiguredWebhooksFile,
  type ListWebhooksResult,
  listWebhooksOrEmpty,
  WEBHOOKS_FILE_ENV,
  type WebhookSubscriptionListing,
} from "@/lib/webhooks-source";

import { WebhookWorkbench } from "./_module/webhook-workbench";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const mod = getModuleByKey("webhooks");
  const configuredFile = getConfiguredWebhooksFile();
  const result = await listWebhooksOrEmpty();
  const webhookSessions = listWebhookSessions();

  // Status derivation:
  //   - healthy: configured and the source parses without error.
  //   - degraded: unconfigured or the source currently fails to parse.
  // No live delivery signal yet — when the inbound pipeline lands,
  // delivery failure rates will feed into this.
  const status: "healthy" | "degraded" = result.ok ? "healthy" : "degraded";

  return (
    <section className="space-y-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Module</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">{mod.label}</h1>
            <Badge state={status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Webhook subscriptions configured for this control plane instance, plus a local workbench
            for registering integrations, dry-running triggers, and validating routing before agents
            are connected. An inbound GitHub receiver at <code>/api/webhooks/github</code> validates
            signatures and appends accepted deliveries to the local event log.
          </p>
          {configuredFile ? (
            <p className="mt-2 font-mono text-xs text-muted/80" title={configuredFile}>
              source file: {configuredFile}
            </p>
          ) : null}
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2">
          <Link
            className="inline-flex h-10 items-center rounded-xs border border-line/80 bg-ink/[0.04] px-3.5 text-sm font-medium text-ink transition-all hover:-translate-y-px hover:border-info/50 hover:bg-info/10"
            href="/webhooks/standalone"
          >
            Standalone view
          </Link>
          <RefreshButton />
        </div>
      </div>

      <WebhooksBody result={result} />
      <WebhookWorkbench />

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Claude Code Action Sessions</h2>
        <p className="text-sm text-muted">
          Live feed of GitHub Actions runs triggered by{" "}
          <code className="rounded bg-ink/[0.06] px-1 py-0.5 text-xs">claude.yml</code> workflows.
          Populated when GitHub sends{" "}
          <code className="rounded bg-ink/[0.06] px-1 py-0.5 text-xs">workflow_run</code> events to{" "}
          <code className="rounded bg-ink/[0.06] px-1 py-0.5 text-xs">/api/webhooks/github</code>.
        </p>
        <WebhookSessionsPanel sessions={webhookSessions} />
      </div>
    </section>
  );
}

function WebhooksBody({ result }: { result: ListWebhooksResult }) {
  if (!result.ok && result.reason === "unconfigured") {
    return (
      <EmptyState
        title="Webhooks are not configured"
        description={`Set ${WEBHOOKS_FILE_ENV} to the absolute path of a JSON file containing an array of WebhookSubscription objects. See docs/modules/webhooks.md for the canonical shape.`}
      />
    );
  }

  if (!result.ok) {
    return (
      <ErrorState
        title="Could not load webhook subscriptions"
        description={result.message ?? `An unknown error occurred reading ${WEBHOOKS_FILE_ENV}.`}
      />
    );
  }

  const { subscriptions } = result.snapshot;
  if (subscriptions.length === 0) {
    return (
      <EmptyState
        title="No webhook subscriptions"
        description={`${WEBHOOKS_FILE_ENV} points at a valid file but it contains no subscriptions yet.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SummaryStrip listings={subscriptions} />
      <WebhookTable listings={subscriptions} />
    </div>
  );
}

function SummaryStrip({ listings }: { readonly listings: readonly WebhookSubscriptionListing[] }) {
  const active = listings.filter((listing) => listing.subscription.enabled).length;
  const paused = listings.length - active;
  const items: readonly { readonly label: string; readonly value: number }[] = [
    { label: "Total subscriptions", value: listings.length },
    { label: "Active", value: active },
    { label: "Paused", value: paused },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-line bg-panel p-3 shadow-control">
          <dt className="text-xs uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

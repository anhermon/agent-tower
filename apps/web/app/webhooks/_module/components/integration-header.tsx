"use client";

import { cn } from "@/lib/utils";

import { getIntegrationStatus } from "../state";

import type {
  ObservedWebhookEvent,
  RegisteredWebhookIntegration,
  WebhookIntegrationStatus,
  WebhookProviderDefinition,
} from "../types";

interface IntegrationHeaderProps {
  readonly provider: WebhookProviderDefinition;
  readonly integration: RegisteredWebhookIntegration | null;
  readonly events: readonly ObservedWebhookEvent[];
  readonly onConfigure: () => void;
  readonly onTestWebhook: () => void;
}

const STATUS_LABELS: Record<WebhookIntegrationStatus, string> = {
  live: "Live",
  planned: "Planned",
  setup: "Setup",
};

const STATUS_TONES: Record<WebhookIntegrationStatus, string> = {
  live: "text-ok",
  planned: "text-muted",
  setup: "text-warn",
};

function computeHeaderStats(events: readonly ObservedWebhookEvent[]) {
  const uniqueRepos = new Set(events.map((e) => e.repository));
  const failedCount = events.filter((e) => e.status === "failed" || e.status === "dlq").length;
  return {
    repoCount: uniqueRepos.size,
    eventCount: events.length,
    failedCount,
  };
}

export function IntegrationHeader({
  provider,
  integration,
  events,
  onConfigure,
  onTestWebhook,
}: IntegrationHeaderProps) {
  const status = integration ? getIntegrationStatus(integration) : "setup";
  const { repoCount, eventCount, failedCount } = computeHeaderStats(events);

  return (
    <header className="glass-panel rounded-lg p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-ink">
              {integration?.name ?? provider.label}
            </h2>
            <span className={cn("pill", STATUS_TONES[status])}>{STATUS_LABELS[status]}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {repoCount} {repoCount === 1 ? "repository" : "repositories"} · {eventCount}{" "}
            {eventCount === 1 ? "event" : "events"}
            {failedCount > 0 && <span className="text-danger"> · {failedCount} failed</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfigure}
            disabled={!integration}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xs border border-line/80 bg-ink/[0.04] px-4 text-sm font-medium text-ink transition-all hover:-translate-y-px hover:border-info/50 hover:bg-info/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Configure
          </button>
          <button
            type="button"
            onClick={onTestWebhook}
            disabled={!integration}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xs border border-transparent accent-gradient px-4 text-sm font-semibold text-[rgb(7_11_20)] shadow-glow transition-all hover:brightness-110 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            Test Webhook
          </button>
        </div>
      </div>
    </header>
  );
}

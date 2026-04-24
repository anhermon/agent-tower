"use client";

import { cn } from "@/lib/utils";

import type { WebhookProviderId } from "../types";

interface ProviderBreakdownProps {
  readonly breakdown: Record<WebhookProviderId, number>;
}

const PROVIDER_COLORS: Record<WebhookProviderId, string> = {
  github: "bg-gray-500",
  slack: "bg-purple-500",
  email: "bg-blue-500",
};

const PROVIDER_LABELS: Record<WebhookProviderId, string> = {
  github: "GitHub",
  slack: "Slack",
  email: "Email",
};

export function ProviderBreakdown({ breakdown }: ProviderBreakdownProps) {
  const entries = Object.entries(breakdown) as [WebhookProviderId, number][];
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  if (total === 0) {
    return (
      <div className="glass-panel rounded-lg p-5 text-center text-sm text-muted">No events yet</div>
    );
  }

  return (
    <div className="glass-panel rounded-lg p-4">
      <p className="eyebrow">Events by Provider</p>
      <div className="mt-3 space-y-3">
        {entries.map(([provider, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const width = max > 0 ? Math.round((count / max) * 100) : 0;
          return (
            <div key={provider}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink">{PROVIDER_LABELS[provider]}</span>
                <span className="text-muted">
                  {count} ({pct}%)
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-ink/[0.06]">
                <div
                  className={cn("h-2 rounded-full transition-all", PROVIDER_COLORS[provider])}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

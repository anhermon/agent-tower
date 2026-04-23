import { cn } from "@/lib/utils";

type WebhookSubscriptionStatus = "active" | "paused";

interface WebhookStatusBadgeProps {
  readonly status: WebhookSubscriptionStatus;
  readonly className?: string;
}

const LABELS: Record<WebhookSubscriptionStatus, string> = {
  active: "Active",
  paused: "Paused",
};

const TONES: Record<WebhookSubscriptionStatus, string> = {
  active: "text-ok",
  paused: "text-muted",
};

export function WebhookStatusBadge({ status, className }: WebhookStatusBadgeProps) {
  return <span className={cn("pill", TONES[status], className)}>{LABELS[status]}</span>;
}

export function subscriptionStatus(enabled: boolean): WebhookSubscriptionStatus {
  return enabled ? "active" : "paused";
}

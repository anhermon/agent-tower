import {
  WEBHOOK_PROVIDER_IDS,
  type WebhookProviderDefinition,
  type WebhookRouteMode,
} from "./types";

export const WEBHOOK_PROVIDER_CATALOG: readonly WebhookProviderDefinition[] = [
  {
    id: WEBHOOK_PROVIDER_IDS.GitHub,
    label: "GitHub",
    receiverState: "live",
    endpointPath: "/api/webhooks/github",
    secretLabel: "GitHub webhook secret",
    description: "Repository pull requests, comments, reviews, and CI activity.",
    events: [
      {
        id: "pull_request.opened",
        label: "Pull request opened",
        action: "opened",
        description: "New PR needs triage or review routing.",
        targetLabel: "octo/control-plane#42",
      },
      {
        id: "issue_comment.created",
        label: "Issue or PR comment",
        action: "created",
        description: "A new comment may need a response or routing.",
        targetLabel: "octo/control-plane#42",
      },
      {
        id: "workflow_run.completed",
        label: "CI workflow completed",
        action: "completed",
        description: "Workflow success or failure can trigger follow-up logic.",
        targetLabel: "ci-fast",
      },
      {
        id: "pull_request_review.submitted",
        label: "PR review submitted",
        action: "submitted",
        description: "Review feedback changed the work state.",
        targetLabel: "octo/control-plane#42",
      },
    ],
  },
  {
    id: WEBHOOK_PROVIDER_IDS.Slack,
    label: "Slack",
    receiverState: "planned",
    endpointPath: "/api/webhooks/slack",
    secretLabel: "Slack signing secret",
    description: "Messages, mentions, and channel reactions from team workspaces.",
    events: [
      {
        id: "message.channels",
        label: "Channel message",
        action: "message",
        description: "A new workspace message arrived in a watched channel.",
        targetLabel: "#agent-ops",
      },
      {
        id: "app_mention.created",
        label: "App mention",
        action: "created",
        description: "The control plane was mentioned directly.",
        targetLabel: "#agent-ops",
      },
      {
        id: "reaction_added.created",
        label: "Reaction added",
        action: "created",
        description: "A reaction marker can route a thread to processing.",
        targetLabel: "eyes",
      },
    ],
  },
  {
    id: WEBHOOK_PROVIDER_IDS.Email,
    label: "Email",
    receiverState: "planned",
    endpointPath: "/api/webhooks/email",
    secretLabel: "Inbound mail token",
    description: "Inbound support, vendor, and operations messages.",
    events: [
      {
        id: "email.received",
        label: "Email received",
        action: "received",
        description: "A new message reached an inbound mailbox.",
        targetLabel: "ops@example.test",
      },
      {
        id: "email.reply",
        label: "Thread reply",
        action: "reply",
        description: "An existing thread received a follow-up.",
        targetLabel: "ticket-1042",
      },
      {
        id: "email.attachment",
        label: "Attachment detected",
        action: "attachment",
        description: "A message includes an attachment that needs handling.",
        targetLabel: "invoice.pdf",
      },
    ],
  },
] as const;

export const WEBHOOK_ROUTE_MODES: readonly {
  readonly id: WebhookRouteMode;
  readonly label: string;
  readonly description: string;
  readonly disabled?: boolean;
}[] = [
  {
    id: "store_only",
    label: "Store event",
    description: "Accept, verify, and keep the delivery visible in the timeline.",
  },
  {
    id: "normalize_and_queue",
    label: "Normalize and queue",
    description: "Convert the provider payload into a canonical event and enqueue it.",
  },
  {
    id: "local_processor",
    label: "Local processor",
    description: "Run a deterministic local handler for UI and routing validation.",
  },
  {
    id: "agent_handoff",
    label: "Agent handoff",
    description: "Reserved for Phase 2 after webhook routing is robust.",
    disabled: true,
  },
] as const;

export const DEFAULT_WEBHOOK_PROVIDER_ID = WEBHOOK_PROVIDER_IDS.GitHub;
export const DEFAULT_WEBHOOK_ROUTE_MODE: WebhookRouteMode = "normalize_and_queue";
export const DEFAULT_LOCAL_PROCESSOR = "webhook-event-dry-run";

import Link from "next/link";

export const dynamic = "force-dynamic";

const SLACK_EVENT_TYPES = [
  {
    id: "message.channels",
    label: "Channel messages",
    description: "New messages posted in watched public or private channels.",
    icon: "#",
  },
  {
    id: "app_mention.created",
    label: "App mentions",
    description: "Direct @mentions of this control-plane app in any channel.",
    icon: "@",
  },
  {
    id: "reaction_added.created",
    label: "Reactions",
    description: "Emoji reactions on messages, useful for routing to agent workflows.",
    icon: ":",
  },
] as const;

export default function SlackWebhooksPage() {
  return (
    <section className="space-y-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link href="/webhooks" className="hover:text-ink">
              Webhooks
            </Link>
            <span>/</span>
            <span className="text-ink">Slack</span>
          </nav>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">Slack</h1>
            <span className="pill text-muted">Receiver planned</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Inbound Slack event subscriptions. The Slack receiver is not yet live — once wired,
            channel messages and app mentions will appear here grouped by workspace and channel.
          </p>
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2">
          <Link
            href="/webhooks/settings"
            className="inline-flex h-10 items-center rounded-xs border border-line/80 bg-ink/[0.04] px-3.5 text-sm font-medium text-ink transition-all hover:-translate-y-px hover:border-info/50 hover:bg-info/10"
          >
            Manage integrations
          </Link>
        </div>
      </div>

      {/* Setup guide */}
      <div className="rounded-lg border border-line/80 bg-panel p-5 shadow-control">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line/80 bg-ink/[0.04] text-lg font-bold text-ink">
            S
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Slack integration — coming soon</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              The Slack receiver endpoint at <code>/api/webhooks/slack</code> is planned for the
              next phase. It will validate the <code>x-slack-signature</code> +{" "}
              <code>x-slack-request-timestamp</code> headers using HMAC-SHA256 before accepting any
              event payload.
            </p>
          </div>
        </div>
      </div>

      {/* Preview: event types */}
      <div>
        <h2 className="eyebrow mb-3">Planned event types</h2>
        <ul className="space-y-3">
          {SLACK_EVENT_TYPES.map((evt) => (
            <li
              key={evt.id}
              className="flex items-start gap-4 rounded-xs border border-line/60 bg-ink/[0.02] p-4"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line/60 bg-panel font-mono text-sm font-bold text-muted">
                {evt.icon}
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{evt.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">{evt.description}</p>
                <p className="mt-1 font-mono text-[11px] text-muted/70">{evt.id}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Preview: channel/DM list placeholder */}
      <div>
        <h2 className="eyebrow mb-3">Channels &amp; DMs (preview)</h2>
        <div className="rounded-xs border border-dashed border-line/80 bg-ink/[0.02] p-8 text-center">
          <p className="text-sm text-muted">
            Once the Slack receiver is live, this area will list watched channels and DMs with
            message event counts and linked agent response threads.
          </p>
          <p className="mt-2 text-xs text-muted/70">
            Configure via{" "}
            <Link href="/webhooks/settings" className="text-info hover:underline">
              /webhooks/settings
            </Link>{" "}
            after the receiver ships.
          </p>
        </div>
      </div>
    </section>
  );
}

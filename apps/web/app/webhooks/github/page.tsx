import Link from "next/link";

import { RefreshButton } from "@/components/ui/refresh-button";
import { EmptyState, ErrorState } from "@/components/ui/state";
import {
  loadGithubWebhookView,
  type GithubDeliveryRow,
  type GithubRepoGroup,
} from "@/lib/github-webhook-view-source";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GithubWebhooksPage() {
  const result = await loadGithubWebhookView();

  return (
    <section className="space-y-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link href="/webhooks" className="hover:text-ink">
              Webhooks
            </Link>
            <span>/</span>
            <span className="text-ink">GitHub</span>
          </nav>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">GitHub</h1>
            <span className="pill text-ok">Receiver live</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Inbound GitHub webhook deliveries grouped by repository. Shows pull requests, issues,
            and CI/CD run outcomes received at <code>/api/webhooks/github</code>.
          </p>
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2">
          <Link
            href="/webhooks/settings"
            className="inline-flex h-10 items-center rounded-xs border border-line/80 bg-ink/[0.04] px-3.5 text-sm font-medium text-ink transition-all hover:-translate-y-px hover:border-info/50 hover:bg-info/10"
          >
            Manage integrations
          </Link>
          <RefreshButton />
        </div>
      </div>

      <GithubBody result={result} />
    </section>
  );
}

function GithubBody({
  result,
}: {
  readonly result: Awaited<ReturnType<typeof loadGithubWebhookView>>;
}) {
  if (!result.ok) {
    return <ErrorState title="Could not load GitHub deliveries" description={result.message} />;
  }

  if (result.totalDeliveries === 0) {
    return (
      <EmptyState
        title="No GitHub deliveries yet"
        description="Point a GitHub repository webhook at /api/webhooks/github with CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_SECRET set. Deliveries appear here once the first event arrives."
      />
    );
  }

  return (
    <div className="space-y-5">
      <GithubSummaryStrip totalDeliveries={result.totalDeliveries} totalRepos={result.totalRepos} />
      <div className="space-y-4">
        {result.repos.map((repo) => (
          <RepoCard key={repo.repoFullName} repo={repo} />
        ))}
      </div>
    </div>
  );
}

function GithubSummaryStrip({
  totalDeliveries,
  totalRepos,
}: {
  readonly totalDeliveries: number;
  readonly totalRepos: number;
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Repositories", value: totalRepos },
        { label: "Total deliveries", value: totalDeliveries },
      ].map((item) => (
        <div key={item.label} className="rounded-md border border-line bg-panel p-3 shadow-control">
          <dt className="text-xs uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RepoCard({ repo }: { readonly repo: GithubRepoGroup }) {
  const categories = [
    { label: "PRs", count: repo.prCount, tone: "text-cyan" },
    { label: "Issues", count: repo.issueCount, tone: "text-warn" },
    { label: "CI/CD", count: repo.ciCount, tone: "text-info" },
    { label: "Other", count: repo.otherCount, tone: "text-muted" },
  ] as const;

  return (
    <div className="rounded-lg border border-line bg-panel shadow-control">
      {/* Repo header */}
      <div className="flex flex-col gap-3 border-b border-line/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate font-mono text-sm font-semibold text-ink">{repo.repoFullName}</h2>
          {repo.lastDeliveryAt ? (
            <p className="mt-1 text-xs text-muted">
              Last delivery:{" "}
              <time dateTime={repo.lastDeliveryAt}>{formatRelative(repo.lastDeliveryAt)}</time>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full border border-line bg-ink/[0.03] px-3 py-1 text-sm font-semibold text-ink">
            {repo.deliveryCount} deliveries
          </span>
        </div>
      </div>

      {/* Event type breakdown */}
      <div className="grid grid-cols-2 gap-0 border-b border-line/60 sm:grid-cols-4">
        {categories.map((cat) => (
          <div key={cat.label} className="border-r border-line/40 p-3 last:border-r-0">
            <p className="text-xs uppercase tracking-wide text-muted">{cat.label}</p>
            <p className={cn("mt-1 text-lg font-semibold", cat.tone)}>{cat.count}</p>
          </div>
        ))}
      </div>

      {/* Recent deliveries */}
      {repo.recentDeliveries.length > 0 ? (
        <div className="p-4">
          <p className="eyebrow mb-3">Recent deliveries</p>
          <ul className="space-y-2">
            {repo.recentDeliveries.map((delivery) => (
              <DeliveryRow key={delivery.id} delivery={delivery} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function DeliveryRow({ delivery }: { readonly delivery: GithubDeliveryRow }) {
  const statusTone =
    delivery.status === "delivered"
      ? "text-ok"
      : delivery.status === "failed"
        ? "text-danger"
        : "text-muted";

  return (
    <li className="flex flex-col gap-1 rounded-xs border border-line/60 bg-ink/[0.02] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="font-mono text-xs font-medium text-ink">{delivery.githubEvent}</span>
        {delivery.action ? (
          <span className="pill text-[11px] text-muted">{delivery.action}</span>
        ) : null}
        {delivery.senderLogin ? (
          <span className="text-xs text-muted">by {delivery.senderLogin}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {!delivery.signatureVerified ? (
          <span className="pill text-[11px] text-warn">unverified</span>
        ) : null}
        <span className={cn("pill text-[11px]", statusTone)}>{delivery.status}</span>
        <time className="font-mono text-[11px] text-muted" dateTime={delivery.attemptedAt}>
          {formatRelative(delivery.attemptedAt)}
        </time>
      </div>
    </li>
  );
}

/** Minimal relative-time helper — no external deps, server-safe. */
function formatRelative(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return isoString;
  }
}

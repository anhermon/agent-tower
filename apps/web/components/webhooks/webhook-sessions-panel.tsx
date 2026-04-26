"use client";

import type { WebhookTriggeredSession } from "@/lib/webhook-session-store";

interface Props {
  readonly sessions: readonly WebhookTriggeredSession[];
}

export function WebhookSessionsPanel({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-md border border-line bg-panel p-6 text-center text-sm text-muted">
        No Claude Code Action sessions received yet. When a{" "}
        <code className="rounded bg-ink/[0.06] px-1 py-0.5 text-xs">workflow_run</code> event
        arrives for a <code className="rounded bg-ink/[0.06] px-1 py-0.5 text-xs">claude.yml</code>{" "}
        run, it will appear here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-panel">
          <tr>
            <Th>Repository</Th>
            <Th>Workflow</Th>
            <Th>Status</Th>
            <Th>Triggered by</Th>
            <Th>Branch</Th>
            <Th>PRs</Th>
            <Th>Started</Th>
            <Th>Logs</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-ink/[0.02]">
              <Td>{s.repositoryFullName}</Td>
              <Td>{s.workflowName}</Td>
              <Td>
                <StatusBadge status={s.status} conclusion={s.conclusion} />
              </Td>
              <Td>{s.triggeredBy}</Td>
              <Td className="max-w-[160px] truncate">{s.headBranch}</Td>
              <Td>
                {s.prNumbers.length > 0 ? (
                  <span className="font-mono text-xs">{s.prNumbers.join(", ")}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Td>
              <Td>
                <time
                  dateTime={s.startedAt}
                  title={s.startedAt}
                  className="font-mono text-xs text-muted"
                >
                  {formatRelative(s.startedAt)}
                </time>
              </Td>
              <Td>
                <a
                  href={s.logsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-info hover:underline"
                >
                  View
                </a>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted"
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 text-ink ${className ?? ""}`}>{children}</td>;
}

type ConclusionValue = WebhookTriggeredSession["conclusion"];
type StatusValue = WebhookTriggeredSession["status"];

function StatusBadge({ status, conclusion }: { status: StatusValue; conclusion: ConclusionValue }) {
  if (status !== "completed") {
    const label = status === "in_progress" ? "Running" : "Queued";
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
        {label}
      </span>
    );
  }

  if (conclusion === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        Success
      </span>
    );
  }

  if (conclusion === "failure" || conclusion === "timed_out") {
    const label = conclusion === "timed_out" ? "Timed out" : "Failed";
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-error/15 px-2 py-0.5 text-xs font-medium text-error">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-error" />
        {label}
      </span>
    );
  }

  const label = conclusion ?? "Completed";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium text-muted">
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return iso;
  }
}

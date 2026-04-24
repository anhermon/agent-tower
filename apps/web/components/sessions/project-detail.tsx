import Link from "next/link";

import type { ProjectSummary, SessionUsageSummary } from "@control-plane/core";

import { SessionBadges } from "@/components/sessions/session-badges";
import { SessionList, type SessionListRow } from "@/components/sessions/session-list";
import {
  formatCost,
  formatDuration,
  formatPercent,
  formatRelative,
  formatTokens,
  truncateMiddle,
} from "@/lib/format";

import type { SessionListing } from "@/lib/sessions-source";

/**
 * Project detail layout — header + stat grid + scoped session table. Driven by
 * canonical `ProjectSummary` + per-session `SessionUsageSummary` rollups. All
 * presentation only: the page component owns data loading.
 */

export interface ProjectDetailProps {
  readonly project: ProjectSummary;
  readonly sessions: readonly SessionUsageSummary[];
  /**
   * Lookup from sessionId → the lightweight file-backed `SessionListing`. The
   * usage summary alone doesn't carry title/size/modifiedAt, so we join on
   * session id for the table rows. Rows without a matching listing fall back
   * to a minimal view.
   */
  readonly listings?: Readonly<Record<string, SessionListing>>;
}

export function ProjectDetail({ project, sessions, listings }: ProjectDetailProps) {
  const totalTokens = project.usage.inputTokens + project.usage.outputTokens;
  const cacheHitRatePct = formatPercent(project.cacheEfficiency.hitRate);
  const savedUsd = formatCost(project.cacheEfficiency.savedUsd);

  const rows = buildRows(sessions, listings ?? {});
  const topTools = Object.entries(project.toolCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  const maxToolCount = topTools[0]?.[1] ?? 1;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/sessions/projects" className="text-cyan hover:underline">
          ← All projects
        </Link>
        <span className="font-mono text-xs text-muted" title={project.displayPath}>
          {truncateMiddle(project.displayPath, 60)}
        </span>
      </div>

      <header className="glass-panel accent-gradient-subtle relative overflow-hidden rounded-lg p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Project</p>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-ink md:text-[28px]">
              {project.displayName || project.id}
            </h1>
            <p className="mt-2 break-all font-mono text-xs text-muted" title={project.displayPath}>
              {project.displayPath || project.id}
            </p>
            <div className="mt-3">
              <SessionBadges flags={project.flags} size="sm" />
            </div>
          </div>
          <div className="text-right">
            <p className="eyebrow">Last active</p>
            <p className="mt-2 text-sm font-medium text-ink">
              {project.lastActive ? formatRelative(project.lastActive) : "—"}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted/70">
              {project.lastActive?.slice(0, 19).replace("T", " ") ?? ""}
            </p>
          </div>
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Stat label="Sessions" value={project.sessionCount.toLocaleString()} />
          <Stat label="Messages" value={project.totalMessages.toLocaleString()} />
          <Stat label="Duration" value={formatDuration(project.totalDurationMs)} />
          <Stat label="Tokens" value={formatTokens(totalTokens)} />
          <Stat label="Est. cost" value={formatCost(project.estimatedCostUsd)} highlight />
          <Stat label="Cache hit" value={cacheHitRatePct} hint={`saved ${savedUsd}`} />
        </dl>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="glass-panel rounded-md p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Sessions</h2>
            <span className="eyebrow">{sessions.length}</span>
          </div>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              No sessions grouped under this project yet.
            </p>
          ) : (
            <SessionList sessions={rows} hideProjectColumn />
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-panel rounded-md p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Top tools</h2>
              <span className="eyebrow">{Object.keys(project.toolCounts).length}</span>
            </div>
            {topTools.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">No tool activity.</p>
            ) : (
              <div className="space-y-1.5">
                {topTools.map(([tool, count]) => {
                  const width = Math.max(6, Math.round((count / maxToolCount) * 100));
                  return (
                    <div key={tool} className="flex items-center gap-2 text-[11px]">
                      <span className="w-20 shrink-0 truncate font-mono text-muted/80" title={tool}>
                        {tool}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="h-full rounded-full bg-info/60"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted/70">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="glass-panel rounded-md p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Branches</h2>
              <span className="eyebrow">{project.branches.length}</span>
            </div>
            {project.branches.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">No git branches captured.</p>
            ) : (
              <ul className="space-y-1.5 font-mono text-[11px] text-muted">
                {project.branches.slice(0, 20).map((branch) => (
                  <li
                    key={branch}
                    title={branch}
                    className="truncate rounded-sm border border-line/60 bg-white/[0.02] px-2 py-1 text-ink/80"
                  >
                    {branch}
                  </li>
                ))}
                {project.branches.length > 20 ? (
                  <li className="pt-1 text-muted/60">+{project.branches.length - 20} more</li>
                ) : null}
              </ul>
            )}
          </div>

          <div className="glass-panel rounded-md p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Token breakdown</h2>
            </div>
            <dl className="space-y-1.5 font-mono text-[11px]">
              <BreakdownRow label="Input" value={project.usage.inputTokens} />
              <BreakdownRow label="Output" value={project.usage.outputTokens} />
              <BreakdownRow label="Cache read" value={project.usage.cacheReadInputTokens} />
              <BreakdownRow label="Cache write" value={project.usage.cacheCreationInputTokens} />
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

interface StatProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly highlight?: boolean;
}

function Stat({ label, value, hint, highlight }: StatProps) {
  return (
    <div className="glass-panel-soft rounded-xs p-3">
      <dt className="eyebrow">{label}</dt>
      <dd
        className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
          highlight ? "text-cyan" : "text-ink"
        }`}
      >
        {value}
      </dd>
      {hint ? <dd className="text-[11px] text-muted/70">{hint}</dd> : null}
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums text-ink/80">{formatTokens(value)}</dd>
    </div>
  );
}

function buildRows(
  sessions: readonly SessionUsageSummary[],
  listings: Readonly<Record<string, SessionListing>>
): readonly SessionListRow[] {
  // eslint-disable-next-line complexity -- row mapping; each field derivation is an independent branch
  return sessions.map((summary): SessionListRow => {
    const listing = listings[summary.sessionId];
    const projectId = listing?.projectId ?? summary.cwd ?? "";
    const sessionId = summary.sessionId;
    const filePath = listing?.filePath ?? sessionId;
    const modifiedAt = listing?.modifiedAt ?? summary.endTime ?? summary.startTime ?? "";
    const sizeBytes = listing?.sizeBytes ?? 0;
    const title = listing?.title ?? null;
    const firstUserText = listing?.firstUserText ?? null;
    const model = listing?.model ?? summary.model ?? null;
    const turnCountLowerBound =
      listing?.turnCountLowerBound ?? summary.userMessageCount + summary.assistantMessageCount;

    return {
      filePath,
      sessionId,
      projectId,
      modifiedAt,
      sizeBytes,
      title,
      firstUserText,
      model,
      turnCountLowerBound,
      flags: summary.flags,
      estimatedCostUsd: summary.estimatedCostUsd,
      durationMs: summary.durationMs,
      messageCount: summary.userMessageCount + summary.assistantMessageCount,
    };
  });
}

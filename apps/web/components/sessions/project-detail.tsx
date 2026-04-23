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
  const rows = buildRows(sessions, listings ?? {});
  return (
    <section className="space-y-6">
      <ProjectBreadcrumb project={project} />
      <ProjectHeader project={project} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <SessionsPanel sessionCount={sessions.length} rows={rows} />
        <div className="space-y-4">
          <TopToolsPanel toolCounts={project.toolCounts} />
          <BranchesPanel branches={project.branches} />
          <TokenBreakdownPanel usage={project.usage} />
        </div>
      </div>
    </section>
  );
}

function ProjectBreadcrumb({ project }: { readonly project: ProjectSummary }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <Link href="/sessions/projects" className="text-cyan hover:underline">
        ← All projects
      </Link>
      <span className="font-mono text-xs text-muted" title={project.displayPath}>
        {truncateMiddle(project.displayPath, 60)}
      </span>
    </div>
  );
}

function ProjectHeader({ project }: { readonly project: ProjectSummary }) {
  const totalTokens = project.usage.inputTokens + project.usage.outputTokens;
  const cacheHitRatePct = formatPercent(project.cacheEfficiency.hitRate);
  const savedUsd = formatCost(project.cacheEfficiency.savedUsd);
  return (
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
  );
}

function SessionsPanel({
  sessionCount,
  rows,
}: {
  readonly sessionCount: number;
  readonly rows: readonly SessionListRow[];
}) {
  return (
    <div className="glass-panel rounded-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Sessions</h2>
        <span className="eyebrow">{sessionCount}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          No sessions grouped under this project yet.
        </p>
      ) : (
        <SessionList sessions={rows} hideProjectColumn />
      )}
    </div>
  );
}

function TopToolsPanel({ toolCounts }: { readonly toolCounts: Readonly<Record<string, number>> }) {
  const topTools = Object.entries(toolCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  const maxToolCount = topTools[0]?.[1] ?? 1;
  return (
    <div className="glass-panel rounded-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Top tools</h2>
        <span className="eyebrow">{Object.keys(toolCounts).length}</span>
      </div>
      {topTools.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">No tool activity.</p>
      ) : (
        <div className="space-y-1.5">
          {topTools.map(([tool, count]) => (
            <ToolRow key={tool} tool={tool} count={count} maxCount={maxToolCount} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolRow({
  tool,
  count,
  maxCount,
}: {
  readonly tool: string;
  readonly count: number;
  readonly maxCount: number;
}) {
  const width = Math.max(6, Math.round((count / maxCount) * 100));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-20 shrink-0 truncate font-mono text-muted/80" title={tool}>
        {tool}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="h-full rounded-full bg-info/60" style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted/70">{count}</span>
    </div>
  );
}

function BranchesPanel({ branches }: { readonly branches: readonly string[] }) {
  return (
    <div className="glass-panel rounded-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Branches</h2>
        <span className="eyebrow">{branches.length}</span>
      </div>
      {branches.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">No git branches captured.</p>
      ) : (
        <ul className="space-y-1.5 font-mono text-[11px] text-muted">
          {branches.slice(0, 20).map((branch) => (
            <li
              key={branch}
              title={branch}
              className="truncate rounded-sm border border-line/60 bg-white/[0.02] px-2 py-1 text-ink/80"
            >
              {branch}
            </li>
          ))}
          {branches.length > 20 ? (
            <li className="pt-1 text-muted/60">+{branches.length - 20} more</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function TokenBreakdownPanel({ usage }: { readonly usage: ProjectSummary["usage"] }) {
  return (
    <div className="glass-panel rounded-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Token breakdown</h2>
      </div>
      <dl className="space-y-1.5 font-mono text-[11px]">
        <BreakdownRow label="Input" value={usage.inputTokens} />
        <BreakdownRow label="Output" value={usage.outputTokens} />
        <BreakdownRow label="Cache read" value={usage.cacheReadInputTokens} />
        <BreakdownRow label="Cache write" value={usage.cacheCreationInputTokens} />
      </dl>
    </div>
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
  return sessions.map((summary) => buildRow(summary, listings[summary.sessionId]));
}

function firstDefined<T>(...values: readonly (T | null | undefined)[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function firstString(...values: readonly (string | null | undefined)[]): string {
  return firstDefined<string>(...values) ?? "";
}

function firstNumber(...values: readonly (number | null | undefined)[]): number {
  return firstDefined<number>(...values) ?? 0;
}

function buildRow(
  summary: SessionUsageSummary,
  listing: SessionListing | undefined
): SessionListRow {
  const sessionId = summary.sessionId;
  const messageCount = summary.userMessageCount + summary.assistantMessageCount;
  return {
    filePath: firstString(listing?.filePath, sessionId),
    sessionId,
    projectId: firstString(listing?.projectId, summary.cwd),
    modifiedAt: firstString(listing?.modifiedAt, summary.endTime, summary.startTime),
    sizeBytes: firstNumber(listing?.sizeBytes),
    title: firstDefined<string>(listing?.title),
    firstUserText: firstDefined<string>(listing?.firstUserText),
    model: firstDefined<string>(listing?.model, summary.model),
    turnCountLowerBound: firstNumber(listing?.turnCountLowerBound, messageCount),
    flags: summary.flags,
    estimatedCostUsd: summary.estimatedCostUsd,
    durationMs: summary.durationMs,
    messageCount,
  };
}

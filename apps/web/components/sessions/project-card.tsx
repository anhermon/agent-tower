import Link from "next/link";

import type { ProjectSummary } from "@control-plane/core";

import { SessionBadges } from "@/components/sessions/session-badges";
import { formatCost, formatDuration, formatRelative, truncateMiddle } from "@/lib/format";

/**
 * Project card — one tile in the `/sessions/projects` grid. Pure presentation,
 * driven by the canonical `ProjectSummary` shape. Renders:
 *   - project name (from displayName) + truncated path (mono)
 *   - session count / total duration / cost
 *   - mini tool-mix bar (top 4 tools)
 *   - derived-flag chips (SessionBadges)
 *   - first few branch names as tiny mono pills
 *   - last-active relative timestamp
 */

export interface ProjectCardProps {
  readonly project: ProjectSummary;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const topTools = topEntries(project.toolCounts, 4);
  const maxToolCount = topTools[0]?.[1] ?? 1;
  const href = `/sessions/projects/${encodeURIComponent(project.id)}`;

  return (
    <Link
      href={href}
      className="glass-panel group relative block h-full overflow-hidden rounded-md p-4 transition-all hover:-translate-y-px hover:border-info/50"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-16 accent-gradient-subtle opacity-0 transition-opacity group-hover:opacity-100"
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">Project</p>
          <p className="mt-1 truncate text-base font-semibold text-ink group-hover:text-cyan">
            {project.displayName || project.id}
          </p>
          <p
            className="mt-1 truncate font-mono text-[11px] text-muted/80"
            title={project.displayPath || project.id}
          >
            {truncateMiddle(project.displayPath || project.id, 48)}
          </p>
        </div>
        <span
          className="shrink-0 whitespace-nowrap text-[11px] text-muted/70"
          title={project.lastActive || undefined}
        >
          {project.lastActive ? formatRelative(project.lastActive) : "—"}
        </span>
      </div>

      <div className="relative mt-3">
        <SessionBadges flags={project.flags} />
      </div>

      <dl className="relative mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="glass-panel-soft rounded-xs px-2 py-1.5">
          <dt className="eyebrow">Sessions</dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
            {project.sessionCount}
          </dd>
        </div>
        <div className="glass-panel-soft rounded-xs px-2 py-1.5">
          <dt className="eyebrow">Duration</dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
            {formatDuration(project.totalDurationMs)}
          </dd>
        </div>
        <div className="glass-panel-soft rounded-xs px-2 py-1.5">
          <dt className="eyebrow">Cost</dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-cyan">
            {formatCost(project.estimatedCostUsd)}
          </dd>
        </div>
      </dl>

      <ToolBar topTools={topTools} maxToolCount={maxToolCount} />
      <BranchFooter totalMessages={project.totalMessages} branches={project.branches} />
    </Link>
  );
}

function topEntries(
  counts: Readonly<Record<string, number>>,
  limit: number
): readonly (readonly [string, number])[] {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

function ToolBar({
  topTools,
  maxToolCount,
}: {
  topTools: readonly (readonly [string, number])[];
  maxToolCount: number;
}) {
  if (topTools.length === 0) return null;
  return (
    <div className="relative mt-3 space-y-1">
      {topTools.map(([tool, count]) => {
        const width = Math.max(6, Math.round((count / maxToolCount) * 100));
        return (
          <div key={tool} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 shrink-0 truncate font-mono text-muted/70" title={tool}>
              {tool}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-info/60" style={{ width: `${width}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted/60">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BranchFooter({
  totalMessages,
  branches,
}: {
  totalMessages: number;
  branches: readonly string[];
}) {
  const branchPreview = branches.slice(0, 3);
  return (
    <div className="relative mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      <span className="font-mono">{totalMessages.toLocaleString()} msgs</span>
      {branches.length > 0 ? (
        <>
          <span aria-hidden="true" className="text-muted/40">
            ·
          </span>
          <span className="font-mono">
            {branches.length} {branches.length === 1 ? "branch" : "branches"}
          </span>
          {branchPreview.map((branch) => (
            <span
              key={branch}
              title={branch}
              className="max-w-[9rem] truncate rounded-sm border border-line/70 bg-white/[0.03] px-1.5 py-px font-mono text-[10px] text-muted/80"
            >
              {branch}
            </span>
          ))}
          {branches.length > branchPreview.length ? (
            <span className="font-mono text-muted/60">
              +{branches.length - branchPreview.length}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

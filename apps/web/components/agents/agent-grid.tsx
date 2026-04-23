"use client";

import Link from "next/link";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";

import { AGENT_STATUSES, type AgentStatus } from "@control-plane/core";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { formatBytes, formatRelative, truncateMiddle } from "@/lib/format";

import type { AgentInventoryItem } from "@/lib/agents-source";

type SortKey = "displayName" | "status" | "lastActiveAt" | "sessionCount" | "totalBytes";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | AgentStatus;

interface AgentGridProps {
  readonly agents: readonly AgentInventoryItem[];
}

const STATUS_FILTERS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: AGENT_STATUSES.Available, label: "Available" },
  { value: AGENT_STATUSES.Busy, label: "Busy" },
  { value: AGENT_STATUSES.Offline, label: "Offline" },
  { value: AGENT_STATUSES.Error, label: "Error" },
];

const SORT_OPTIONS: readonly { readonly value: SortKey; readonly label: string }[] = [
  { value: "lastActiveAt", label: "Last active" },
  { value: "displayName", label: "Name" },
  { value: "status", label: "Status" },
  { value: "sessionCount", label: "Sessions" },
  { value: "totalBytes", label: "Size" },
];

const STATUS_WEIGHT: Record<AgentStatus, number> = {
  [AGENT_STATUSES.Available]: 0,
  [AGENT_STATUSES.Busy]: 1,
  [AGENT_STATUSES.Error]: 2,
  [AGENT_STATUSES.Offline]: 3,
};

export function AgentGrid({ agents }: AgentGridProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sortKey, setSortKey] = useState<SortKey>("lastActiveAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(
    () => filterAndSort(agents, deferredQuery, statusFilter, sortKey, sortDir),
    [agents, deferredQuery, statusFilter, sortKey, sortDir]
  );

  const counts = useMemo(() => countByStatus(agents), [agents]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "displayName" || key === "status" ? "asc" : "desc");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="glass-panel flex h-10 w-full max-w-md items-center gap-2 rounded-xs px-3">
          <span aria-hidden="true" className="text-muted">
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name, project, or id…"
            aria-label="Filter agents"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs text-muted hover:text-ink"
              aria-label="Clear filter"
            >
              clear
            </button>
          ) : null}
        </label>
        <p className="eyebrow">
          {filtered.length === agents.length
            ? `${agents.length} agents`
            : `${filtered.length} of ${agents.length} agents`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((option) => {
          const active = statusFilter === option.value;
          const count = option.value === "all" ? agents.length : (counts[option.value] ?? 0);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              aria-pressed={active}
              className={`control-chip h-8 rounded-full text-xs ${active ? "is-active" : ""}`}
            >
              <span>{option.label}</span>
              <span className={active ? "text-ink" : "text-muted/70"}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">Sort</span>
        {SORT_OPTIONS.map((option) => {
          const active = sortKey === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleSort(option.value)}
              aria-pressed={active}
              className={`control-chip h-8 text-xs ${active ? "is-active" : ""}`}
            >
              {option.label}
              <span aria-hidden="true" className="text-[10px]">
                {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyMatch query={query} />
      ) : (
        <ul role="list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((agent) => (
            <li key={agent.descriptor.id}>
              <AgentCard agent={agent} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentCard({ agent }: { readonly agent: AgentInventoryItem }): ReactNode {
  const href = `/agents/${encodeURIComponent(agent.descriptor.id)}`;
  return (
    <Link
      href={href}
      className="glass-panel group relative block h-full overflow-hidden rounded-md p-5 transition-all hover:-translate-y-px hover:border-info/50"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-20 accent-gradient-subtle opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Agent</p>
          <p className="mt-1 truncate text-base font-semibold text-ink group-hover:text-cyan">
            {agent.descriptor.displayName}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-muted" title={agent.projectId}>
            {truncateMiddle(agent.projectId, 40)}
          </p>
        </div>
        <AgentStatusBadge status={agent.state.status} />
      </div>

      <dl className="relative mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="glass-panel-soft rounded-xs p-3">
          <dt className="eyebrow">Sessions</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">{agent.sessionCount}</dd>
        </div>
        <div className="glass-panel-soft rounded-xs p-3">
          <dt className="eyebrow">Transcript</dt>
          <dd className="mt-1 text-lg font-semibold text-ink">{formatBytes(agent.totalBytes)}</dd>
        </div>
      </dl>

      <p className="relative mt-4 text-xs text-muted">
        Last active{" "}
        {agent.lastActiveAt ? (
          <>
            <span className="text-ink">{formatRelative(agent.lastActiveAt)}</span>
            <span className="ml-2 font-mono text-[11px] text-muted/70">{agent.lastActiveAt}</span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </p>
      <p className="relative mt-1 font-mono text-[11px] uppercase tracking-wider text-muted/70">
        {agent.descriptor.runtime} · {agent.descriptor.kind}
      </p>
    </Link>
  );
}

function EmptyMatch({ query }: { readonly query: string }): ReactNode {
  return (
    <div className="rounded-md border border-dashed border-line/70 bg-white/[0.02] p-6 text-center text-sm text-muted">
      {query.trim().length === 0 ? (
        "No agents match the current filters."
      ) : (
        <>
          No agents match <code className="font-mono text-xs">{query}</code>.
        </>
      )}
    </div>
  );
}

function filterAndSort(
  agents: readonly AgentInventoryItem[],
  query: string,
  statusFilter: StatusFilter,
  sortKey: SortKey,
  sortDir: SortDirection
): readonly AgentInventoryItem[] {
  const trimmed = query.trim().toLowerCase();
  const statusFiltered =
    statusFilter === "all" ? agents : agents.filter((agent) => agent.state.status === statusFilter);

  const filtered =
    trimmed.length === 0
      ? [...statusFiltered]
      : statusFiltered.filter((agent) => matchesQuery(agent, trimmed));

  filtered.sort((a, b) => compareBy(a, b, sortKey));
  if (sortDir === "desc") filtered.reverse();
  return filtered;
}

function matchesQuery(agent: AgentInventoryItem, needle: string): boolean {
  const haystacks: readonly string[] = [
    agent.descriptor.displayName,
    agent.descriptor.id,
    agent.projectId,
  ];
  for (const haystack of haystacks) {
    if (haystack?.toLowerCase().includes(needle)) return true;
  }
  return false;
}

function compareBy(a: AgentInventoryItem, b: AgentInventoryItem, key: SortKey): number {
  switch (key) {
    case "displayName":
      return byString(a.descriptor.displayName, b.descriptor.displayName);
    case "status":
      return STATUS_WEIGHT[a.state.status] - STATUS_WEIGHT[b.state.status];
    case "lastActiveAt": {
      const al = a.lastActiveAt ?? "";
      const bl = b.lastActiveAt ?? "";
      if (al === bl) return 0;
      return al < bl ? -1 : 1;
    }
    case "sessionCount":
      return a.sessionCount - b.sessionCount;
    case "totalBytes":
      return a.totalBytes - b.totalBytes;
  }
}

function byString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function countByStatus(agents: readonly AgentInventoryItem[]): Record<AgentStatus, number> {
  const counts: Record<AgentStatus, number> = {
    [AGENT_STATUSES.Available]: 0,
    [AGENT_STATUSES.Busy]: 0,
    [AGENT_STATUSES.Offline]: 0,
    [AGENT_STATUSES.Error]: 0,
  };
  for (const agent of agents) {
    counts[agent.state.status] += 1;
  }
  return counts;
}

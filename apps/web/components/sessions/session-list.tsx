"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import type { SessionListing } from "@/lib/sessions-source";
import { formatBytes, formatRelative, truncateMiddle } from "@/lib/format";

type SortKey = "title" | "project" | "size" | "modified";
type SortDirection = "asc" | "desc";

type SessionListProps = {
  sessions: readonly SessionListing[];
};

export function SessionList({ sessions }: SessionListProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sortKey, setSortKey] = useState<SortKey>("modified");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const filtered = useMemo(
    () => filterAndSort(sessions, deferredQuery, sortKey, sortDir),
    [sessions, deferredQuery, sortKey, sortDir]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "title" || key === "project" ? "asc" : "desc");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <label className="glass-panel flex h-10 w-full max-w-md items-center gap-2 rounded-xs px-3">
          <span aria-hidden="true" className="text-muted">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title, project, or session id…"
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
          {filtered.length === sessions.length
            ? `${sessions.length} sessions`
            : `${filtered.length} of ${sessions.length} sessions`}
        </p>
      </div>

      <div className="glass-panel overflow-hidden rounded-md">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase text-muted">
              <tr>
                <SortableTh
                  label="Title"
                  active={sortKey === "title"}
                  direction={sortDir}
                  onClick={() => toggleSort("title")}
                  className="min-w-72"
                />
                <SortableTh
                  label="Project"
                  active={sortKey === "project"}
                  direction={sortDir}
                  onClick={() => toggleSort("project")}
                  className="min-w-56"
                />
                <SortableTh
                  label="Size"
                  active={sortKey === "size"}
                  direction={sortDir}
                  onClick={() => toggleSort("size")}
                  className="w-28"
                />
                <SortableTh
                  label="Last modified"
                  active={sortKey === "modified"}
                  direction={sortDir}
                  onClick={() => toggleSort("modified")}
                  className="w-56"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">
                    No sessions match <code className="font-mono text-xs">{query}</code>.
                  </td>
                </tr>
              ) : (
                filtered.map((session) => (
                  <tr key={session.filePath} className="transition-colors hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/sessions/${session.sessionId}`}
                        className="block group"
                        title={session.title ?? session.sessionId}
                      >
                        <span className="block truncate text-sm font-medium text-ink group-hover:text-cyan">
                          {session.title ?? <em className="text-muted">untitled</em>}
                        </span>
                        <span className="mt-1 block truncate font-mono text-xs text-muted">
                          {truncateMiddle(session.sessionId, 18)}
                        </span>
                      </Link>
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-xs text-muted"
                      title={session.projectId}
                    >
                      {truncateMiddle(session.projectId, 40)}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatBytes(session.sizeBytes)}</td>
                    <td className="px-4 py-3 text-muted">
                      <span>{formatRelative(session.modifiedAt)}</span>
                      <span className="ml-2 font-mono text-xs text-muted/70">
                        {session.modifiedAt}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type SortableThProps = {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
};

function SortableTh({ label, active, direction, onClick, className }: SortableThProps): ReactNode {
  return (
    <th className={`px-4 py-3 font-semibold ${className ?? ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 text-left uppercase tracking-wide ${
          active ? "text-ink" : "text-muted hover:text-ink"
        }`}
        aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">
          {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function filterAndSort(
  sessions: readonly SessionListing[],
  query: string,
  sortKey: SortKey,
  sortDir: SortDirection
): readonly SessionListing[] {
  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed.length === 0
    ? [...sessions]
    : sessions.filter((session) => matchesQuery(session, trimmed));

  filtered.sort((a, b) => compareBy(a, b, sortKey));
  if (sortDir === "desc") filtered.reverse();
  return filtered;
}

function matchesQuery(session: SessionListing, needle: string): boolean {
  const haystacks = [
    session.title ?? "",
    session.firstUserText ?? "",
    session.projectId,
    session.sessionId,
    session.model ?? ""
  ];
  for (const haystack of haystacks) {
    if (haystack && haystack.toLowerCase().includes(needle)) return true;
  }
  return false;
}

function compareBy(a: SessionListing, b: SessionListing, key: SortKey): number {
  switch (key) {
    case "title":
      return byString(a.title ?? a.sessionId, b.title ?? b.sessionId);
    case "project":
      return byString(a.projectId, b.projectId);
    case "size":
      return a.sizeBytes - b.sizeBytes;
    case "modified":
      return a.modifiedAt < b.modifiedAt ? -1 : a.modifiedAt > b.modifiedAt ? 1 : 0;
  }
}

function byString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

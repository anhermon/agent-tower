"use client";

import type { SessionDerivedFlags } from "@control-plane/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SessionBadges } from "@/components/sessions/session-badges";
import {
  matchesSessionFilters,
  type SessionFilterKey,
  SessionFilters,
} from "@/components/sessions/session-filters";
import {
  formatBytes,
  formatCost,
  formatDuration,
  formatRelative,
  truncateMiddle,
} from "@/lib/format";
import type { SessionListing } from "@/lib/sessions-source";
import { cn } from "@/lib/utils";

/**
 * Paginated + filterable sessions table. Accepts either plain `SessionListing`
 * rows (legacy `/sessions` page) or enriched rows carrying usage-summary data
 * (project detail, future Wave-5 search). Sorting + keyboard nav + facet
 * filters all work regardless of which fields are populated — missing values
 * render as em-dashes.
 *
 * Keyboard (list-scoped):
 *   - j / ArrowDown: next row
 *   - k / ArrowUp: previous row
 *   - Enter: navigate to the focused session
 *   - Esc: clear selection + return focus to filter input
 *
 * The handler ignores keystrokes while any input/textarea is focused so the
 * filter box keeps working normally.
 */

type SortKey = "title" | "project" | "size" | "modified" | "cost" | "duration" | "messages";
type SortDirection = "asc" | "desc";

export interface SessionListRow extends SessionListing {
  readonly flags?: SessionDerivedFlags;
  readonly estimatedCostUsd?: number;
  readonly durationMs?: number;
  readonly messageCount?: number;
}

type SessionListProps = {
  sessions: readonly SessionListRow[];
  /** Optional initial page size. Defaults to 25. */
  pageSize?: number;
  /** Hide the project column — useful when the list is already project-scoped. */
  hideProjectColumn?: boolean;
};

const DEFAULT_PAGE_SIZE = 25;

export function SessionList({
  sessions,
  pageSize = DEFAULT_PAGE_SIZE,
  hideProjectColumn = false,
}: SessionListProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sortKey, setSortKey] = useState<SortKey>("modified");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [activeFilters, setActiveFilters] = useState<Partial<Record<SessionFilterKey, boolean>>>(
    {}
  );
  const [page, setPage] = useState(0);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const filterInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const hasAnyFlags = useMemo(() => sessions.some((session) => session.flags), [sessions]);

  const filtered = useMemo(
    () => filterAndSort(sessions, deferredQuery, activeFilters, sortKey, sortDir),
    [sessions, deferredQuery, activeFilters, sortKey, sortDir]
  );

  // When the filtered set shrinks, keep the page valid.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const paginated = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize]
  );

  // Reset to page 0 when filters/search/sort change. `deferredQuery` is the
  // debounced-for-render copy of `query`; tracking it (not `query`) avoids an
  // extra reset on every keystroke. The dep array intentionally lists inputs
  // that gate this effect even though the setters don't consume them — we
  // want the effect to fire on any of those inputs changing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset-on-change intent
  useEffect(() => {
    setPage(0);
    setFocusIndex(null);
  }, [deferredQuery, activeFilters, sortKey, sortDir]);

  // Keep row refs array sized to the visible page.
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, paginated.length);
  }, [paginated.length]);

  const moveFocus = useCallback(
    (delta: number) => {
      if (paginated.length === 0) return;
      setFocusIndex((prev) => {
        const current = prev ?? -1;
        const next = Math.max(0, Math.min(paginated.length - 1, current + delta));
        return next;
      });
    },
    [paginated.length]
  );

  // Scroll focused row into view.
  useEffect(() => {
    if (focusIndex === null) return;
    const row = rowRefs.current[focusIndex];
    if (row) {
      row.focus({ preventScroll: false });
    }
  }, [focusIndex]);

  useKeyboardNav({
    focusIndex,
    paginated,
    moveFocus,
    router,
    filterInputRef,
    queryLength: query.length,
    clearFocus: () => setFocusIndex(null),
    clearQuery: () => setQuery(""),
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "title" || key === "project" ? "asc" : "desc");
  };

  const filterCounts = useMemo(() => computeFilterCounts(sessions), [sessions]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <label className="glass-panel flex h-10 w-full max-w-md items-center gap-2 rounded-xs px-3">
          <span aria-hidden="true" className="text-muted">
            ⌕
          </span>
          <input
            ref={filterInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title, project, or session id…"
            aria-label="Filter sessions"
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

      {hasAnyFlags ? (
        <SessionFilters value={activeFilters} onChange={setActiveFilters} counts={filterCounts} />
      ) : null}

      <div className="glass-panel overflow-hidden rounded-md">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-left text-sm">
            <TableHead
              sortKey={sortKey}
              sortDir={sortDir}
              toggleSort={toggleSort}
              hideProjectColumn={hideProjectColumn}
              hasAnyFlags={hasAnyFlags}
            />
            <TableBody
              paginated={paginated}
              focusIndex={focusIndex}
              query={query}
              hideProjectColumn={hideProjectColumn}
              hasAnyFlags={hasAnyFlags}
              onFocus={setFocusIndex}
              rowRefs={rowRefs}
            />
          </table>
        </div>
      </div>

      {pageCount > 1 ? (
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          total={filtered.length}
          pageStart={pageStart}
          pageSize={pageSize}
        />
      ) : null}

      <p className="text-[11px] text-muted/60">
        Keyboard: <kbd className="font-mono">j</kbd> / <kbd className="font-mono">k</kbd> to move,{" "}
        <kbd className="font-mono">Enter</kbd> to open, <kbd className="font-mono">/</kbd> to
        filter, <kbd className="font-mono">Esc</kbd> to clear.
      </p>
    </div>
  );
}

interface PaginationProps {
  readonly page: number;
  readonly pageCount: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly total: number;
  readonly pageStart: number;
  readonly pageSize: number;
}

function Pagination({
  page,
  pageCount,
  onPrev,
  onNext,
  total,
  pageStart,
  pageSize,
}: PaginationProps): ReactNode {
  const rangeEnd = Math.min(total, pageStart + pageSize);
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted">
      <span className="font-mono tabular-nums">
        {pageStart + 1}–{rangeEnd} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page === 0}
          className="control-chip h-8 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="font-mono tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= pageCount - 1}
          className="control-chip h-8 disabled:opacity-40"
        >
          Next →
        </button>
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
  align?: "left" | "right";
};

function SortableTh({
  label,
  active,
  direction,
  onClick,
  className,
  align = "left",
}: SortableThProps): ReactNode {
  return (
    <th
      className={`px-4 py-3 font-semibold ${className ?? ""}`}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 uppercase tracking-wide",
          align === "right" ? "justify-end text-right" : "text-left",
          active ? "text-ink" : "text-muted hover:text-ink",
          align === "right" ? "ml-auto" : ""
        )}
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">
          {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function columnCount(hideProjectColumn: boolean, hasAnyFlags: boolean): number {
  // Title + Msgs + Duration + Cost + Size + Modified = 6
  let n = 6;
  if (!hideProjectColumn) n += 1;
  if (hasAnyFlags) n += 1;
  return n;
}

interface TableHeadProps {
  readonly sortKey: SortKey;
  readonly sortDir: SortDirection;
  readonly toggleSort: (key: SortKey) => void;
  readonly hideProjectColumn: boolean;
  readonly hasAnyFlags: boolean;
}

function TableHead({
  sortKey,
  sortDir,
  toggleSort,
  hideProjectColumn,
  hasAnyFlags,
}: TableHeadProps): ReactNode {
  return (
    <thead className="bg-white/[0.03] text-xs uppercase text-muted">
      <tr>
        <SortableTh
          label="Title"
          active={sortKey === "title"}
          direction={sortDir}
          onClick={() => toggleSort("title")}
          className="min-w-64"
        />
        {hideProjectColumn ? null : (
          <SortableTh
            label="Project"
            active={sortKey === "project"}
            direction={sortDir}
            onClick={() => toggleSort("project")}
            className="min-w-48"
          />
        )}
        {hasAnyFlags ? (
          <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted w-48">
            Flags
          </th>
        ) : null}
        <SortableTh
          label="Msgs"
          active={sortKey === "messages"}
          direction={sortDir}
          onClick={() => toggleSort("messages")}
          className="w-20 text-right"
          align="right"
        />
        <SortableTh
          label="Duration"
          active={sortKey === "duration"}
          direction={sortDir}
          onClick={() => toggleSort("duration")}
          className="w-24 text-right"
          align="right"
        />
        <SortableTh
          label="Cost"
          active={sortKey === "cost"}
          direction={sortDir}
          onClick={() => toggleSort("cost")}
          className="w-24 text-right"
          align="right"
        />
        <SortableTh
          label="Size"
          active={sortKey === "size"}
          direction={sortDir}
          onClick={() => toggleSort("size")}
          className="w-24 text-right"
          align="right"
        />
        <SortableTh
          label="Last modified"
          active={sortKey === "modified"}
          direction={sortDir}
          onClick={() => toggleSort("modified")}
          className="w-48"
        />
      </tr>
    </thead>
  );
}

interface TableBodyProps {
  readonly paginated: readonly SessionListRow[];
  readonly focusIndex: number | null;
  readonly query: string;
  readonly hideProjectColumn: boolean;
  readonly hasAnyFlags: boolean;
  readonly onFocus: (index: number) => void;
  readonly rowRefs: React.MutableRefObject<(HTMLTableRowElement | null)[]>;
}

function TableBody({
  paginated,
  focusIndex,
  query,
  hideProjectColumn,
  hasAnyFlags,
  onFocus,
  rowRefs,
}: TableBodyProps): ReactNode {
  if (paginated.length === 0) {
    return (
      <tbody className="divide-y divide-line/60">
        <tr>
          <td
            colSpan={columnCount(hideProjectColumn, hasAnyFlags)}
            className="px-4 py-10 text-center text-sm text-muted"
          >
            <EmptyBodyMessage query={query} />
          </td>
        </tr>
      </tbody>
    );
  }
  return (
    <tbody className="divide-y divide-line/60">
      {paginated.map((session, index) => (
        <SessionRow
          key={session.filePath}
          session={session}
          index={index}
          isFocused={focusIndex === index}
          hideProjectColumn={hideProjectColumn}
          hasAnyFlags={hasAnyFlags}
          onFocus={onFocus}
          rowRef={(node) => {
            rowRefs.current[index] = node;
          }}
        />
      ))}
    </tbody>
  );
}

function EmptyBodyMessage({ query }: { readonly query: string }): ReactNode {
  if (query.trim().length === 0) {
    return <>No sessions match the current filters.</>;
  }
  return (
    <>
      No sessions match <code className="font-mono text-xs">{query}</code>.
    </>
  );
}

interface SessionRowProps {
  readonly session: SessionListRow;
  readonly index: number;
  readonly isFocused: boolean;
  readonly hideProjectColumn: boolean;
  readonly hasAnyFlags: boolean;
  readonly onFocus: (index: number) => void;
  readonly rowRef: (node: HTMLTableRowElement | null) => void;
}

function SessionRow({
  session,
  index,
  isFocused,
  hideProjectColumn,
  hasAnyFlags,
  onFocus,
  rowRef,
}: SessionRowProps): ReactNode {
  return (
    <tr
      ref={rowRef}
      tabIndex={isFocused ? 0 : -1}
      onClick={() => onFocus(index)}
      className={cn(
        "transition-colors hover:bg-white/[0.03] focus:outline-none",
        isFocused ? "bg-white/[0.05]" : ""
      )}
    >
      <TitleCell session={session} />
      {hideProjectColumn ? null : <ProjectCell session={session} />}
      {hasAnyFlags ? <FlagsCell session={session} /> : null}
      <NumberCell value={session.messageCount} format={formatInteger} tone="muted" />
      <NumberCell value={session.durationMs} format={formatDuration} tone="muted" />
      <NumberCell value={session.estimatedCostUsd} format={formatCost} tone="cyan" />
      <td className="px-4 py-3 text-right text-muted">{formatBytes(session.sizeBytes)}</td>
      <ModifiedCell session={session} />
    </tr>
  );
}

function TitleCell({ session }: { readonly session: SessionListRow }): ReactNode {
  return (
    <td className="px-4 py-3">
      <Link
        href={`/sessions/${encodeURIComponent(session.sessionId)}`}
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
  );
}

function ProjectCell({ session }: { readonly session: SessionListRow }): ReactNode {
  return (
    <td className="px-4 py-3 font-mono text-xs text-muted" title={session.projectId}>
      {truncateMiddle(session.projectId, 40)}
    </td>
  );
}

function FlagsCell({ session }: { readonly session: SessionListRow }): ReactNode {
  return (
    <td className="px-4 py-3">{session.flags ? <SessionBadges flags={session.flags} /> : null}</td>
  );
}

function ModifiedCell({ session }: { readonly session: SessionListRow }): ReactNode {
  return (
    <td className="px-4 py-3 text-muted">
      <span>{formatRelative(session.modifiedAt)}</span>
      <span className="ml-2 font-mono text-xs text-muted/70">
        {session.modifiedAt.slice(0, 10)}
      </span>
    </td>
  );
}

interface NumberCellProps {
  readonly value: number | undefined;
  readonly format: (n: number) => string;
  readonly tone: "muted" | "cyan";
}

function NumberCell({ value, format, tone }: NumberCellProps): ReactNode {
  const toneClass = tone === "cyan" ? "text-cyan" : "text-muted";
  return (
    <td className={cn("px-4 py-3 text-right font-mono tabular-nums", toneClass)}>
      {typeof value === "number" ? format(value) : "—"}
    </td>
  );
}

function formatInteger(n: number): string {
  return n.toLocaleString();
}

interface KeyboardNavOptions {
  readonly focusIndex: number | null;
  readonly paginated: readonly SessionListRow[];
  readonly moveFocus: (delta: number) => void;
  readonly router: ReturnType<typeof useRouter>;
  readonly filterInputRef: React.RefObject<HTMLInputElement | null>;
  readonly queryLength: number;
  readonly clearFocus: () => void;
  readonly clearQuery: () => void;
}

function useKeyboardNav(options: KeyboardNavOptions): void {
  const {
    focusIndex,
    paginated,
    moveFocus,
    router,
    filterInputRef,
    queryLength,
    clearFocus,
    clearQuery,
  } = options;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = isEditableTarget(target);
      const filterInput = filterInputRef.current;

      if (
        handleEscapeKey(event, {
          isEditable,
          target,
          filterInput,
          focusIndex,
          hasQuery: queryLength > 0,
          clearFocus,
          clearQuery,
        })
      ) {
        return;
      }

      if (isEditable) return;

      handleNavKey(event, {
        focusIndex,
        paginated,
        moveFocus,
        router,
        filterInput,
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    focusIndex,
    paginated,
    moveFocus,
    router,
    filterInputRef,
    queryLength,
    clearFocus,
    clearQuery,
  ]);
}

function isEditableTarget(target: HTMLElement | null): boolean {
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

interface EscapeHandlerContext {
  readonly isEditable: boolean;
  readonly target: HTMLElement | null;
  readonly filterInput: HTMLInputElement | null;
  readonly focusIndex: number | null;
  readonly hasQuery: boolean;
  readonly clearFocus: () => void;
  readonly clearQuery: () => void;
}

// Returns true when the event has been handled and caller should stop.
function handleEscapeKey(event: KeyboardEvent, ctx: EscapeHandlerContext): boolean {
  if (event.key !== "Escape") return false;
  if (ctx.focusIndex !== null) {
    event.preventDefault();
    ctx.clearFocus();
    ctx.filterInput?.focus();
    return true;
  }
  if (ctx.isEditable && ctx.target === ctx.filterInput && ctx.hasQuery) {
    event.preventDefault();
    ctx.clearQuery();
    return true;
  }
  return false;
}

interface NavContext {
  readonly focusIndex: number | null;
  readonly paginated: readonly SessionListRow[];
  readonly moveFocus: (delta: number) => void;
  readonly router: ReturnType<typeof useRouter>;
  readonly filterInput: HTMLInputElement | null;
}

const ARROW_DELTAS: Readonly<Record<string, number>> = {
  j: +1,
  ArrowDown: +1,
  k: -1,
  ArrowUp: -1,
};

function handleNavKey(event: KeyboardEvent, ctx: NavContext): void {
  const delta = ARROW_DELTAS[event.key];
  if (delta !== undefined) {
    event.preventDefault();
    ctx.moveFocus(delta);
    return;
  }
  if (event.key === "Enter" && ctx.focusIndex !== null) {
    const row = ctx.paginated[ctx.focusIndex];
    if (row) {
      event.preventDefault();
      ctx.router.push(`/sessions/${encodeURIComponent(row.sessionId)}`);
    }
    return;
  }
  if (event.key === "/") {
    event.preventDefault();
    ctx.filterInput?.focus();
  }
}

const FILTER_FLAG_KEYS: readonly SessionFilterKey[] = [
  "hasCompaction",
  "usesTaskAgent",
  "usesMcp",
  "usesWebSearch",
  "usesWebFetch",
  "hasThinking",
];

function computeFilterCounts(
  sessions: readonly SessionListRow[]
): Partial<Record<SessionFilterKey, number>> {
  const counts: Partial<Record<SessionFilterKey, number>> = {};
  for (const session of sessions) {
    const flags = session.flags;
    if (!flags) continue;
    for (const key of FILTER_FLAG_KEYS) {
      if (flags[key]) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

export function filterAndSort(
  sessions: readonly SessionListRow[],
  query: string,
  activeFilters: Partial<Record<SessionFilterKey, boolean>>,
  sortKey: SortKey,
  sortDir: SortDirection
): readonly SessionListRow[] {
  const trimmed = query.trim().toLowerCase();
  const facetFiltered = sessions.filter((session) => {
    if (!session.flags) {
      // Rows without flags match only when no facet filter is active.
      return Object.keys(activeFilters).length === 0;
    }
    return matchesSessionFilters(session.flags, activeFilters);
  });
  const filtered =
    trimmed.length === 0
      ? [...facetFiltered]
      : facetFiltered.filter((session) => matchesQuery(session, trimmed));

  filtered.sort((a, b) => compareBy(a, b, sortKey));
  if (sortDir === "desc") filtered.reverse();
  return filtered;
}

function matchesQuery(session: SessionListRow, needle: string): boolean {
  const haystacks = [
    session.title ?? "",
    session.firstUserText ?? "",
    session.projectId,
    session.sessionId,
    session.model ?? "",
  ];
  for (const haystack of haystacks) {
    if (haystack?.toLowerCase().includes(needle)) return true;
  }
  return false;
}

const SORT_COMPARATORS: Readonly<
  Record<SortKey, (a: SessionListRow, b: SessionListRow) => number>
> = {
  title: (a, b) => byString(a.title ?? a.sessionId, b.title ?? b.sessionId),
  project: (a, b) => byString(a.projectId, b.projectId),
  size: (a, b) => a.sizeBytes - b.sizeBytes,
  modified: (a, b) => byModified(a.modifiedAt, b.modifiedAt),
  cost: (a, b) => (a.estimatedCostUsd ?? 0) - (b.estimatedCostUsd ?? 0),
  duration: (a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0),
  messages: (a, b) => (a.messageCount ?? 0) - (b.messageCount ?? 0),
};

function compareBy(a: SessionListRow, b: SessionListRow, key: SortKey): number {
  return SORT_COMPARATORS[key](a, b);
}

function byModified(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function byString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

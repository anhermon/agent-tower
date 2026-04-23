"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SessionSearchHit } from "@control-plane/core";

import { truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Global full-text search palette. Bound to ⌘K / `/` via the
 * `KeyboardNavProvider`. Hits are fetched from `/api/sessions/search` with the
 * current query debounced at 160 ms; each keystroke aborts the in-flight
 * request so only the latest query's results land.
 *
 * Enter on a hit navigates to `/sessions/[id]?turn=<turnId>` so the detail
 * page scrolls the matching turn into view. Escape closes the palette.
 */

export interface GlobalSearchProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const DEBOUNCE_MS = 160;
const LIMIT = 25;

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<readonly SessionSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Reset state when the palette closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setError(null);
      setLoading(false);
      controllerRef.current?.abort();
      controllerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    const timer = setTimeout(() => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(null);

      fetch(`/api/sessions/search?q=${encodeURIComponent(trimmed)}&limit=${LIMIT}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `Search failed (${res.status})`);
          }
          return res.json() as Promise<readonly SessionSearchHit[]>;
        })
        .then((next) => {
          if (controller.signal.aborted) return;
          setHits(next);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, open]);

  const navigate = useCallback(
    (hit: SessionSearchHit) => {
      onOpenChange(false);
      const params = new URLSearchParams();
      if (hit.turnId) params.set("turn", hit.turnId);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      router.push(`/sessions/${encodeURIComponent(hit.sessionId)}${suffix}`);
    },
    [onOpenChange, router]
  );

  // Group hits by project for the `Command.Group` render. Memoized so render
  // is stable even while new hits stream in.
  const grouped = useMemo(() => {
    const byProject = new Map<string, SessionSearchHit[]>();
    for (const hit of hits) {
      const bucket = byProject.get(hit.projectSlug) ?? [];
      bucket.push(hit);
      byProject.set(hit.projectSlug, bucket);
    }
    return [...byProject.entries()].map(([slug, slugHits]) => ({ slug, hits: slugHits }));
  }, [hits]);

  if (!open) return null;

  return (
    // Reason: role="dialog" is a non-interactive ARIA role, but this is the
    // backdrop overlay for a modal. Click-to-close + Escape are the standard
    // dismiss affordances; mouse/keyboard listeners are required here even
    // though the rule flags non-interactive roles.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search sessions"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onOpenChange(false);
      }}
    >
      <Command
        label="Session search"
        className="glass-panel w-full max-w-2xl overflow-hidden rounded-md"
        // We handle filtering entirely server-side; cmdk's local fuzzy match
        // would double-filter against already-ranked hits.
        shouldFilter={false}
      >
        <div className="flex items-center gap-2 border-b border-line/60 px-4">
          <span aria-hidden="true" className="text-muted">
            ⌕
          </span>
          <Command.Input
            // Reason: modal-open focus trap — focus the search input when
            // the palette opens so keyboard users can start typing immediately.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search across all session transcripts…"
            className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close search"
            className="text-xs text-muted hover:text-ink"
          >
            esc
          </button>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          {loading ? <div className="px-3 py-4 text-sm text-muted">Searching…</div> : null}
          {error ? <div className="px-3 py-4 text-sm text-danger">Error: {error}</div> : null}
          {!loading && !error && query.trim() && hits.length === 0 ? (
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
              No matches for <code className="font-mono text-xs">{query}</code>.
            </Command.Empty>
          ) : null}
          {!query.trim() ? (
            <div className="px-3 py-8 text-center text-sm text-muted">
              Type to search across every local transcript.
            </div>
          ) : null}

          {grouped.map((group) => (
            <Command.Group
              key={group.slug}
              heading={
                <span className="font-mono text-[11px] text-muted/80">
                  {truncateMiddle(group.slug, 60)}
                </span>
              }
            >
              {group.hits.map((hit) => (
                <Command.Item
                  key={`${hit.sessionId}:${hit.turnId}`}
                  value={`${hit.sessionId}:${hit.turnId}:${hit.snippet}`}
                  onSelect={() => navigate(hit)}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-sm px-3 py-2 text-sm",
                    "data-[selected=true]:bg-white/[0.06]"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[11px] text-muted">
                      {hit.sessionId.slice(0, 8)} · turn {hit.turnId.slice(0, 6) || "—"}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted/60">
                      score {hit.score}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-ink/90">{hit.snippet}</p>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}

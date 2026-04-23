"use client";

import type { SessionDerivedFlags } from "@control-plane/core";

import { cn } from "@/lib/utils";

/**
 * Facet filter strip — a row of toggleable chips that narrow a session list by
 * `SessionDerivedFlags` booleans. Emits the active set as an object so the
 * parent list component filters sessions locally.
 *
 * Used by `SessionList` (session-level) and `project-detail` (scoped list).
 */

export type SessionFilterKey = keyof SessionDerivedFlags;

export interface SessionFiltersProps {
  readonly value: Partial<Record<SessionFilterKey, boolean>>;
  readonly onChange: (next: Partial<Record<SessionFilterKey, boolean>>) => void;
  readonly counts?: Partial<Record<SessionFilterKey, number>>;
  readonly className?: string;
}

interface FacetDef {
  readonly key: SessionFilterKey;
  readonly label: string;
}

const FACETS: readonly FacetDef[] = [
  { key: "hasCompaction", label: "Compaction" },
  { key: "usesTaskAgent", label: "Agent" },
  { key: "usesMcp", label: "MCP" },
  { key: "usesWebSearch", label: "WebSearch" },
  { key: "usesWebFetch", label: "WebFetch" },
  { key: "hasThinking", label: "Thinking" },
];

export function SessionFilters({ value, onChange, counts, className }: SessionFiltersProps) {
  const active = new Set(FACETS.filter(({ key }) => value[key] === true).map((f) => f.key));

  const toggle = (key: SessionFilterKey) => {
    const next = { ...value };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = true;
    }
    onChange(next);
  };

  const clearAll = () => onChange({});

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="eyebrow">Filters</span>
      {FACETS.map((facet) => {
        const isActive = active.has(facet.key);
        const count = counts?.[facet.key];
        return (
          <button
            key={facet.key}
            type="button"
            onClick={() => toggle(facet.key)}
            aria-pressed={isActive}
            className={cn("control-chip h-8 rounded-full text-xs", isActive ? "is-active" : "")}
          >
            <span>{facet.label}</span>
            {typeof count === "number" ? (
              <span className={cn(isActive ? "text-ink" : "text-muted/70")}>{count}</span>
            ) : null}
          </button>
        );
      })}
      {active.size > 0 ? (
        <button type="button" onClick={clearAll} className="text-xs text-muted hover:text-ink">
          clear
        </button>
      ) : null}
    </div>
  );
}

/**
 * Pure predicate used by the session list to filter in place. Exported for
 * reuse + test coverage.
 */
export function matchesSessionFilters(
  flags: SessionDerivedFlags,
  active: Partial<Record<SessionFilterKey, boolean>>
): boolean {
  for (const key of Object.keys(active) as SessionFilterKey[]) {
    if (active[key] && !flags[key]) return false;
  }
  return true;
}

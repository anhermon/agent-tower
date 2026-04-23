"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { formatRelative } from "@/lib/format";
import type { SkillManifest } from "@/lib/skills-source";

type SortKey = "name" | "modified" | "root";
type SortDirection = "asc" | "desc";

/**
 * The subset of {@link SkillManifest} fields the grid actually renders. We
 * intentionally exclude `body` and `frontmatter` because individual SKILL.md
 * files can be arbitrarily large — serialising the full manifest into the RSC
 * flight payload can balloon the page past the browser's ability to render.
 */
export type SkillGridItem = Pick<
  SkillManifest,
  | "id"
  | "name"
  | "summary"
  | "description"
  | "triggers"
  | "rootDirectory"
  | "rootLabel"
  | "relativePath"
  | "modifiedAt"
  | "sizeBytes"
>;

type SkillGridProps = {
  skills: readonly SkillGridItem[];
};

export function SkillGrid({ skills }: SkillGridProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [rootFilter, setRootFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const roots = useMemo(() => uniqueRoots(skills), [skills]);
  const filtered = useMemo(
    () => filterAndSort(skills, deferredQuery, rootFilter, sortKey, sortDir),
    [skills, deferredQuery, rootFilter, sortKey, sortDir]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "modified" ? "desc" : "asc");
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
            placeholder="Filter by name, trigger, description, or id…"
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
          {filtered.length === skills.length
            ? `${skills.length} skills`
            : `${filtered.length} of ${skills.length} skills`}
        </p>
      </div>

      {roots.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Roots</span>
          <button
            type="button"
            onClick={() => setRootFilter(null)}
            className={`control-chip${rootFilter === null ? " is-active" : ""}`}
          >
            All · {skills.length}
          </button>
          {roots.map((root) => (
            <button
              key={root.directory}
              type="button"
              onClick={() =>
                setRootFilter((prev) => (prev === root.directory ? null : root.directory))
              }
              className={`control-chip${rootFilter === root.directory ? " is-active" : ""}`}
              title={root.directory}
            >
              {root.label} · {root.count}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Sort</span>
        <SortChip
          label="Name"
          active={sortKey === "name"}
          direction={sortDir}
          onClick={() => toggleSort("name")}
        />
        <SortChip
          label="Last modified"
          active={sortKey === "modified"}
          direction={sortDir}
          onClick={() => toggleSort("modified")}
        />
        <SortChip
          label="Root"
          active={sortKey === "root"}
          direction={sortDir}
          onClick={() => toggleSort("root")}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-md p-6 text-center text-sm text-muted">
          No skills match the current filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}

type SortChipProps = {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
};

function SortChip({ label, active, direction, onClick }: SortChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`control-chip${active ? " is-active" : ""}`}
      aria-pressed={active}
    >
      {label}
      <span aria-hidden="true" className="text-[10px] opacity-70">
        {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

function SkillCard({ skill }: { skill: SkillGridItem }) {
  const href = `/skills/${encodeURIComponent(skill.id)}`;
  const triggerPreview = skill.triggers.slice(0, 3);
  return (
    <Link
      href={href}
      className="glass-panel group block rounded-md p-4 transition-transform hover:-translate-y-px hover:border-info/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Skill</p>
          <h3 className="mt-1 truncate text-base font-semibold text-ink group-hover:text-cyan">
            {skill.name}
          </h3>
        </div>
        <span
          className="inline-flex shrink-0 rounded-full border border-line/70 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-muted"
          title={skill.rootDirectory}
        >
          {skill.rootLabel}
        </span>
      </div>
      {skill.summary ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{skill.summary}</p>
      ) : (
        <p className="mt-3 text-sm italic leading-6 text-muted/70">
          (no description in frontmatter)
        </p>
      )}
      {triggerPreview.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {triggerPreview.map((trigger) => (
            <span
              key={trigger}
              className="inline-flex rounded-full border border-line/70 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-muted-strong"
            >
              {trigger}
            </span>
          ))}
          {skill.triggers.length > triggerPreview.length ? (
            <span className="inline-flex rounded-full border border-line/70 bg-white/[0.03] px-2 py-0.5 text-[11px] text-muted/70">
              +{skill.triggers.length - triggerPreview.length}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 flex items-center justify-between text-[11px] text-muted">
        <span className="font-mono" title={skill.relativePath || skill.id}>
          {skill.id}
        </span>
        <span title={skill.modifiedAt}>{formatRelative(skill.modifiedAt)}</span>
      </div>
    </Link>
  );
}

interface RootBucket {
  readonly directory: string;
  readonly label: string;
  readonly count: number;
}

function uniqueRoots(skills: readonly SkillGridItem[]): readonly RootBucket[] {
  const counts = new Map<string, RootBucket>();
  for (const skill of skills) {
    const existing = counts.get(skill.rootDirectory);
    if (existing) {
      counts.set(skill.rootDirectory, { ...existing, count: existing.count + 1 });
    } else {
      counts.set(skill.rootDirectory, {
        directory: skill.rootDirectory,
        label: skill.rootLabel,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function filterAndSort(
  skills: readonly SkillGridItem[],
  query: string,
  rootFilter: string | null,
  sortKey: SortKey,
  sortDir: SortDirection
): readonly SkillGridItem[] {
  const trimmed = query.trim().toLowerCase();
  let next = skills.filter((skill) => !rootFilter || skill.rootDirectory === rootFilter);
  if (trimmed.length > 0) {
    next = next.filter((skill) => matchesQuery(skill, trimmed));
  }
  const sorted = [...next].sort((a, b) => compareBy(a, b, sortKey));
  if (sortDir === "desc") sorted.reverse();
  return sorted;
}

function matchesQuery(skill: SkillGridItem, needle: string): boolean {
  const haystacks = [
    skill.name,
    skill.id,
    skill.relativePath,
    skill.description ?? "",
    skill.summary ?? "",
    skill.triggers.join(" "),
  ];
  for (const haystack of haystacks) {
    if (haystack?.toLowerCase().includes(needle)) return true;
  }
  return false;
}

function compareBy(a: SkillGridItem, b: SkillGridItem, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    case "modified":
      return a.modifiedAt < b.modifiedAt ? -1 : a.modifiedAt > b.modifiedAt ? 1 : 0;
    case "root": {
      const byRoot = a.rootLabel.localeCompare(b.rootLabel);
      if (byRoot !== 0) return byRoot;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
  }
}

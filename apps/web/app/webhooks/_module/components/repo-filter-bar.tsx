"use client";

import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface RepoFilterBarProps {
  readonly repos: string[];
  readonly activeRepoIds: string[];
  readonly onToggleRepo: (repo: string) => void;
  readonly onAddRepo: (repo: string) => void;
}

export function RepoFilterBar({
  repos,
  activeRepoIds,
  onToggleRepo,
  onAddRepo,
}: RepoFilterBarProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    if (!query.trim()) return repos.slice(0, 5);
    const q = query.toLowerCase();
    return repos.filter((r) => r.toLowerCase().includes(q)).slice(0, 5);
  }, [query, repos]);

  const handleAdd = (repo: string) => {
    onAddRepo(repo);
    setQuery("");
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      handleAdd(query.trim());
    }
    if (e.key === "Escape") {
      setIsAdding(false);
      setQuery("");
    }
  };

  if (repos.length === 0 && !isAdding) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="control-chip is-active h-8 text-xs">All repositories</span>
        <button
          type="button"
          onClick={() => {
            setIsAdding(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="control-chip h-8 text-xs"
        >
          + Add repo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {repos.map((repo) => {
        const active = activeRepoIds.includes(repo);
        return (
          <button
            key={repo}
            type="button"
            onClick={() => onToggleRepo(repo)}
            aria-pressed={active}
            className={cn("control-chip h-8 text-xs", active && "is-active")}
          >
            {repo}
          </button>
        );
      })}

      {isAdding ? (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setTimeout(() => {
                setIsAdding(false);
                setQuery("");
              }, 150);
            }}
            placeholder="Type repo name…"
            className="h-8 w-40 rounded-xs border border-line/80 bg-ink/[0.04] px-2.5 text-xs text-ink placeholder:text-muted focus:border-info/50 focus:bg-info/10 focus:outline-none"
          />
          {suggestions.length > 0 && (
            <ul className="absolute left-0 top-full z-10 mt-1 w-48 rounded-xs border border-line/80 bg-panel py-1 shadow-lg">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleAdd(s);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-info/10"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setIsAdding(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="control-chip h-8 text-xs"
        >
          + Add repo
        </button>
      )}
    </div>
  );
}

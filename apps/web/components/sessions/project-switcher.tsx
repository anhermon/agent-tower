"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ProjectSummary } from "@control-plane/core";

import { formatCost, formatRelative, truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Project switcher — a cmdk-powered combobox for jumping to a specific
 * `/sessions/projects/[slug]` detail page. Opened inline or via ⌘K / Ctrl+K.
 *
 * Keyboard:
 *   - Ctrl+K / ⌘K (global): open
 *   - Esc: close
 *   - Enter: navigate
 *
 * Non-trapping: ⌘K only intercepts when no input/textarea is focused, so the
 * browser's native in-field shortcuts still work.
 */

export interface ProjectSwitcherProps {
  readonly projects: readonly ProjectSummary[];
  readonly className?: string;
}

export function ProjectSwitcher({ projects, className }: ProjectSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (target instanceof HTMLElement && target.isContentEditable);

      // Ctrl+K / ⌘K opens switcher *only* when focus is not already in a text
      // input — otherwise native deletion / fill behaviour is preserved.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !isEditable) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const navigate = useCallback(
    (slug: string) => {
      setOpen(false);
      setQuery("");
      router.push(`/sessions/projects/${encodeURIComponent(slug)}`);
    },
    [router]
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "glass-panel inline-flex h-10 items-center gap-2 rounded-xs px-3 text-sm text-muted hover:text-ink",
          className
        )}
      >
        <span aria-hidden="true">⌕</span>
        <span>Switch project…</span>
        <kbd className="ml-2 font-mono text-[10px] text-muted/70">⌘K</kbd>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Project switcher"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <Command
            label="Project switcher"
            className="glass-panel w-full max-w-xl overflow-hidden rounded-md"
            shouldFilter
          >
            <div className="flex items-center gap-2 border-b border-line/60 px-4">
              <span aria-hidden="true" className="text-muted">
                ⌕
              </span>
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search projects by name or path…"
                className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-xs text-muted hover:text-ink"
              >
                esc
              </button>
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
                No projects match <code className="font-mono text-xs">{query}</code>.
              </Command.Empty>

              {projects.map((project) => {
                const valueParts = [project.displayName, project.displayPath, project.id]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <Command.Item
                    key={project.id}
                    value={valueParts}
                    onSelect={() => navigate(project.id)}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm data-[selected=true]:bg-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">
                        {project.displayName || project.id}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted/70">
                        {truncateMiddle(project.displayPath || project.id, 60)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[11px] text-muted">
                      <div className="tabular-nums">
                        {project.sessionCount} · {formatCost(project.estimatedCostUsd)}
                      </div>
                      <div className="text-muted/60">
                        {project.lastActive ? formatRelative(project.lastActive) : "—"}
                      </div>
                    </div>
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </>
  );
}

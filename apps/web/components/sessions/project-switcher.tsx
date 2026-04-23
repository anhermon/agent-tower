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

function isEditableElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || (el instanceof HTMLElement && el.isContentEditable)
  );
}

function makeSwitcherKeyHandler(
  open: boolean,
  setOpen: (fn: (prev: boolean) => boolean) => void,
  closeDialog: () => void
) {
  return (event: KeyboardEvent) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "k" &&
      !isEditableElement(event.target)
    ) {
      event.preventDefault();
      setOpen((prev) => !prev);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeDialog();
    }
  };
}

export function ProjectSwitcher({ projects, className }: ProjectSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeDialog = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = makeSwitcherKeyHandler(open, setOpen, closeDialog);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeDialog]);

  // Focus the search input when the dialog opens (replaces autoFocus)
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const input = dialogRef.current?.querySelector<HTMLInputElement>("input");
        input?.focus();
      }, 0);
    }
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
        <>
          {/* Backdrop — semantically a button so click + keyboard events are valid */}
          <button
            type="button"
            aria-label="Close project switcher"
            className="fixed inset-0 z-50 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Project switcher"
            ref={dialogRef}
            className="fixed inset-x-0 top-[12vh] z-50 flex justify-center px-4"
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
        </>
      ) : null}
    </>
  );
}

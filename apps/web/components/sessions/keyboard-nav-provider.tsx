"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { GlobalSearch } from "@/components/sessions/global-search";

/**
 * Global keyboard-nav provider for the `/sessions/**` routes. Wraps children
 * with a listener that implements the Wave-5 shortcut table:
 *
 *   g s → /sessions
 *   g p → /sessions/projects
 *   g c → /sessions/costs
 *   g t → /sessions/tools
 *   g a → /sessions/activity
 *   g o → /sessions/overview
 *   ⌘K / Ctrl+K / `/` → open the global search palette
 *   Esc → close any open overlay
 *
 * Shortcuts are **ignored** whenever focus is inside an input, textarea, or a
 * contenteditable region — so existing per-view shortcuts (j/k list nav,
 * ⌘F find-in-session, list filter input) keep working without collision.
 *
 * The `g <x>` chord uses a 1200 ms buffer between the leader `g` and the
 * follow-up key: press `g` then `s` within 1.2 s to jump. Typing `g` in prose
 * is safe because the follow-up listener short-circuits on any non-chord key.
 */

const LEADER_KEY = "g";
const CHORD_WINDOW_MS = 1200;

const CHORD_MAP: Readonly<Record<string, string>> = {
  s: "/sessions",
  p: "/sessions/projects",
  c: "/sessions/costs",
  t: "/sessions/tools",
  a: "/sessions/activity",
  o: "/sessions/overview",
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function handleEscape(event: KeyboardEvent, searchOpen: boolean, closeSearch: () => void): boolean {
  if (event.key !== "Escape" || !searchOpen) return false;
  event.preventDefault();
  closeSearch();
  return true;
}

function handleCommandK(
  event: KeyboardEvent,
  setSearchOpen: (fn: (prev: boolean) => boolean) => void
): boolean {
  if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) return false;
  event.preventDefault();
  setSearchOpen((prev) => !prev);
  return true;
}

function handleSlash(event: KeyboardEvent, editable: boolean, openSearch: () => void): boolean {
  if (event.key !== "/" || editable || event.metaKey || event.ctrlKey || event.altKey) return false;
  event.preventDefault();
  openSearch();
  return true;
}

function handleLeader(event: KeyboardEvent, leaderAtRef: { current: number | null }): boolean {
  if (event.key !== LEADER_KEY || event.metaKey || event.ctrlKey || event.altKey) return false;
  leaderAtRef.current = Date.now();
  return true;
}

function handleChord(
  event: KeyboardEvent,
  leaderAtRef: { current: number | null },
  router: ReturnType<typeof useRouter>
): void {
  const primedAt = leaderAtRef.current;
  if (primedAt === null) return;
  if (Date.now() - primedAt <= CHORD_WINDOW_MS) {
    const target = CHORD_MAP[event.key.toLowerCase()];
    if (target) {
      event.preventDefault();
      router.push(target);
    }
  }
  leaderAtRef.current = null;
}

export function KeyboardNavProvider({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const leaderAtRef = useRef<number | null>(null);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handleEscape(event, searchOpen, closeSearch)) return;
      if (handleCommandK(event, setSearchOpen)) return;
      const editable = isEditableTarget(event.target);
      if (handleSlash(event, editable, openSearch)) return;
      if (editable) return;
      if (handleLeader(event, leaderAtRef)) return;
      handleChord(event, leaderAtRef, router);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, searchOpen, openSearch, closeSearch]);

  return (
    <>
      {children}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

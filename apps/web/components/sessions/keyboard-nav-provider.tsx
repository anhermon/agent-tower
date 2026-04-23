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

export function KeyboardNavProvider({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const leaderAtRef = useRef<number | null>(null);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);

      // Always handle Escape — even when the dialog has focus, we want to
      // close cleanly. But do not preempt a native "clear input on Esc".
      if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        closeSearch();
        return;
      }

      // ⌘K / Ctrl+K opens search regardless of editable state — it's a
      // well-known command palette shortcut.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      // `/` opens search only when not in an input field.
      if (event.key === "/" && !editable && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openSearch();
        return;
      }

      // Leader / chord keys are off-limits in editable contexts.
      if (editable) return;

      // Leader: record the timestamp and wait for a follow-up key.
      if (event.key === LEADER_KEY && !event.metaKey && !event.ctrlKey && !event.altKey) {
        leaderAtRef.current = Date.now();
        return;
      }

      // Follow-up chord candidate — only fire when recently primed.
      const primedAt = leaderAtRef.current;
      if (primedAt !== null) {
        if (Date.now() - primedAt <= CHORD_WINDOW_MS) {
          const target = CHORD_MAP[event.key.toLowerCase()];
          if (target) {
            event.preventDefault();
            router.push(target);
          }
        }
        leaderAtRef.current = null;
      }
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

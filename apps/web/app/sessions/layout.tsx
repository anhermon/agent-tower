import { KeyboardNavProvider } from "@/components/sessions/keyboard-nav-provider";
import { SessionsSubNav } from "@/components/sessions/sub-nav";

import type { ReactNode } from "react";

/**
 * Shared layout for every `/sessions/**` route. Renders the sub-nav strip
 * above the page content so Overview / Projects / Sessions / Costs / Tools /
 * Activity stay one click apart. The root sidebar entry for "Sessions" still
 * points at `/sessions` (the list view); this layout lights the matching tab
 * based on pathname.
 *
 * Wrapped in `KeyboardNavProvider` so the Wave-5 `g s` / `g p` / … chords and
 * the ⌘K / `/` global-search palette work on every sessions surface.
 */
export default function SessionsLayout({ children }: { children: ReactNode }) {
  return (
    <KeyboardNavProvider>
      <SessionsSubNav />
      {children}
    </KeyboardNavProvider>
  );
}

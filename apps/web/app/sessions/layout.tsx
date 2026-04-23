import type { ReactNode } from "react";
import { SessionsSubNav } from "@/components/sessions/sub-nav";

/**
 * Shared layout for every `/sessions/**` route. Renders the sub-nav strip
 * above the page content so Overview / Projects / Sessions / Costs / Tools /
 * Activity stay one click apart. The root sidebar entry for "Sessions" still
 * points at `/sessions` (the list view); this layout lights the matching tab
 * based on pathname.
 */
export default function SessionsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <SessionsSubNav />
      {children}
    </div>
  );
}

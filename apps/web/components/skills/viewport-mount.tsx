"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Defer mounting `children` until the element's top edge is near the viewport.
 *
 * Paired with `next/dynamic({ ssr: false })` on heavy subtrees (Recharts
 * dashboards, the 150-card `SkillGrid`) this prevents the corresponding
 * chunk download + parse from happening at hydration time, and keeps
 * below-the-fold work outside the TBT window.
 *
 * Degradation model:
 *   - SSR: render `fallback` (never `children`).
 *   - Client mount with no IntersectionObserver: render `children`
 *     immediately (jsdom / older browsers / axe test harness).
 *   - Client mount with IntersectionObserver: render `fallback` until
 *     the sentinel intersects, then render `children` forever.
 */

interface ViewportMountProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  /**
   * Intersection root margin. Default preloads 200px before entry.
   * Use `"0px 0px -20% 0px"` (or stricter) so below-the-fold charts do not
   * mount on first paint even on tall viewports.
   */
  readonly rootMargin?: string;
  readonly minHeight?: number | string;
}

export function ViewportMount({
  children,
  fallback,
  rootMargin = "200px 0px",
  minHeight = 320,
}: ViewportMountProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin, threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;

  return (
    <div ref={ref} style={{ minHeight }}>
      {fallback ?? <DefaultSkeleton minHeight={minHeight} />}
    </div>
  );
}

function DefaultSkeleton({ minHeight }: { readonly minHeight: number | string }) {
  return (
    <div
      className="w-full animate-pulse rounded-sm bg-white/[0.03]"
      style={{ minHeight }}
      aria-hidden
    />
  );
}

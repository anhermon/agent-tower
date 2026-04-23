"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly match: (pathname: string) => boolean;
}

const ITEMS: readonly NavItem[] = [
  {
    label: "Overview",
    href: "/sessions/overview",
    match: (p) => p === "/sessions/overview" || p.startsWith("/sessions/overview/"),
  },
  {
    label: "Projects",
    href: "/sessions/projects",
    match: (p) => p === "/sessions/projects" || p.startsWith("/sessions/projects/"),
  },
  {
    label: "Sessions",
    href: "/sessions",
    // Exact `/sessions` or `/sessions/<id>` (detail), but NOT any of the
    // analytics sub-routes.
    match: (p) => {
      if (p === "/sessions") return true;
      if (!p.startsWith("/sessions/")) return false;
      const tail = p.slice("/sessions/".length).split("/")[0] ?? "";
      return !["overview", "projects", "costs", "tools", "activity"].includes(tail);
    },
  },
  {
    label: "Costs",
    href: "/sessions/costs",
    match: (p) => p === "/sessions/costs" || p.startsWith("/sessions/costs/"),
  },
  {
    label: "Tools",
    href: "/sessions/tools",
    match: (p) => p === "/sessions/tools" || p.startsWith("/sessions/tools/"),
  },
  {
    label: "Activity",
    href: "/sessions/activity",
    match: (p) => p === "/sessions/activity" || p.startsWith("/sessions/activity/"),
  },
];

export function SessionsSubNav() {
  const pathname = usePathname() ?? "/sessions";

  return (
    <nav
      aria-label="Sessions sub-navigation"
      className="mb-5 flex flex-wrap gap-1 border-b border-line/60"
    >
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-t-sm px-3 py-2 text-sm font-medium transition-colors",
              active ? "text-ink" : "text-muted hover:text-muted-strong"
            )}
          >
            <span>{item.label}</span>
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-all",
                active ? "bg-accent" : "bg-transparent"
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}

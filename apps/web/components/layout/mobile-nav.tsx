"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { modules } from "@/lib/modules";
import { cn } from "@/lib/utils";

/**
 * Mobile-only horizontal nav used in the topbar. Extracted as a client
 * component so the surrounding `Topbar` can stay a server component while
 * still getting `aria-current` parity with the desktop `Sidebar`.
 */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="glass-panel mx-auto mt-3 flex max-w-[1480px] gap-1 overflow-x-auto rounded-lg px-2 py-2 lg:hidden"
      aria-label="Primary"
    >
      {modules.map((module) => {
        const active =
          module.href === "/"
            ? pathname === "/"
            : pathname === module.href || pathname.startsWith(`${module.href}/`);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-xs px-3 text-sm font-medium transition-colors",
              active ? "bg-accent/15 text-ink" : "text-muted hover:bg-white/5 hover:text-ink"
            )}
            href={module.href}
            key={module.key}
          >
            <Icon name={module.icon} className="h-4 w-4" />
            {module.label}
          </Link>
        );
      })}
    </nav>
  );
}

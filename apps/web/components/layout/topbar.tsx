import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MobileNav } from "./mobile-nav";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 px-4 py-4 sm:px-6 lg:px-8">
      <div className="glass-panel mx-auto flex w-full max-w-[1480px] flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="brand-mark" aria-hidden="true">
            CP
          </div>
          <div className="min-w-0">
            <p className="eyebrow">Hermes-grade ops</p>
            <p className="truncate text-sm font-semibold text-ink">Control Plane</p>
          </div>
        </div>

        {/* Decorative placeholder for a future command palette. Hidden from
            assistive tech so it doesn't mis-advertise a non-existent
            search input. */}
        <div
          aria-hidden="true"
          className="relative flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-xs border border-line/80 bg-white/5 px-3 text-sm text-muted"
        >
          <Icon name="search" className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">Search sessions, agents, events</span>
          <span className="ml-auto hidden rounded-full border border-line/80 px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted sm:inline-flex">
            ⌘K
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="pill text-info">Gateway · local</span>
          <ThemeToggle />
          <Button
            aria-label="Notifications"
            className="w-10 px-0"
            icon={<Icon name="bell" className="h-4 w-4" />}
          />
        </div>
      </div>

      <MobileNav />
    </header>
  );
}

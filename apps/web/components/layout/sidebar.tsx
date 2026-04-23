"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { modules } from "@/lib/modules";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden w-64 shrink-0 flex-col gap-4 p-4 lg:flex",
        "sticky top-0 h-screen"
      )}
    >
      <div className="glass-panel flex items-center gap-3 rounded-lg px-4 py-4">
        <div className="brand-mark">CP</div>
        <div className="min-w-0">
          <p className="eyebrow">Hermes-grade ops</p>
          <p className="truncate text-sm font-semibold text-ink">Control Plane</p>
        </div>
      </div>

      <div className="glass-panel flex flex-1 flex-col overflow-hidden rounded-lg p-3">
        <p className="eyebrow px-2 pb-2 pt-1">Modules</p>
        <nav className="flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Primary">
          {modules.map((module) => {
            const active = pathname === module.href;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-xs px-3 text-sm font-medium transition-all",
                  active
                    ? "bg-accent/15 text-ink shadow-glow"
                    : "text-muted hover:-translate-y-px hover:bg-white/5 hover:text-ink"
                )}
                href={module.href}
                key={module.key}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full accent-gradient"
                  />
                ) : null}
                <Icon
                  name={module.icon}
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    active ? "text-cyan" : "text-muted group-hover:text-ink"
                  )}
                />
                <span className="truncate">{module.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "ml-auto h-1.5 w-1.5 rounded-full transition-all",
                    module.status === "healthy" && "bg-ok shadow-[0_0_8px_rgb(var(--color-ok))]",
                    module.status === "degraded" && "bg-warn shadow-[0_0_8px_rgb(var(--color-warn))]",
                    module.status === "down" && "bg-danger shadow-[0_0_8px_rgb(var(--color-danger))]",
                    module.status === "idle" && "bg-muted/40"
                  )}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

import type { SessionDerivedFlags } from "@control-plane/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Session-level feature chips. Rendered from the canonical
 * `SessionDerivedFlags` shape so the presentation stays consistent anywhere a
 * session is listed (project card, project detail table, session list, etc.).
 *
 * Shared by Wave 2 (list/card) and Wave 3 (detail header). Pure presentation;
 * no side effects.
 */

type BadgeTone = "amber" | "violet" | "sky" | "emerald" | "rose" | "slate";

interface ChipDef {
  readonly key: keyof SessionDerivedFlags;
  readonly label: string;
  readonly title: string;
  readonly tone: BadgeTone;
}

const CHIPS: readonly ChipDef[] = [
  {
    key: "hasCompaction",
    label: "compaction",
    title: "Contains compaction boundary",
    tone: "amber",
  },
  { key: "usesTaskAgent", label: "agent", title: "Uses sub-agent (Task)", tone: "violet" },
  { key: "usesMcp", label: "mcp", title: "Invokes an MCP tool", tone: "sky" },
  { key: "usesWebSearch", label: "websearch", title: "Invokes WebSearch", tone: "emerald" },
  { key: "usesWebFetch", label: "webfetch", title: "Invokes WebFetch", tone: "rose" },
  { key: "hasThinking", label: "thinking", title: "Contains extended thinking", tone: "slate" },
];

const TONE_CLASSES: Record<BadgeTone, string> = {
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  slate: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

export interface SessionBadgesProps {
  readonly flags: SessionDerivedFlags;
  readonly className?: string;
  readonly size?: "xs" | "sm";
}

export function SessionBadges({ flags, className, size = "xs" }: SessionBadgesProps): ReactNode {
  const active = CHIPS.filter((chip) => flags[chip.key]);
  if (active.length === 0) return null;

  const sizeClass = size === "sm" ? "h-5 px-1.5 text-[11px]" : "h-[18px] px-1.5 text-[10px]";

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {active.map((chip) => (
        <span
          key={chip.key}
          title={chip.title}
          className={cn(
            "inline-flex shrink-0 items-center rounded-sm border font-mono uppercase tracking-wide",
            TONE_CLASSES[chip.tone],
            sizeClass
          )}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

export interface SessionBadgesCountProps {
  readonly flags: SessionDerivedFlags;
}

/** Returns the number of badges a given flag set would render. Useful for
 *  fixed-width columns that need to reserve horizontal space. */
export function sessionBadgeCount(flags: SessionDerivedFlags): number {
  return CHIPS.reduce((n, chip) => (flags[chip.key] ? n + 1 : n), 0);
}

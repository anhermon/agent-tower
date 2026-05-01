"use client";

import { cn } from "@/lib/utils";

/** Display name and colour for each known harness kind. */
const HARNESS_META: Readonly<Record<string, { label: string; className: string }>> = {
  "claude-code": {
    label: "Claude Code",
    className: "bg-cyan/10 text-cyan border border-cyan/20",
  },
  codex: {
    label: "Codex",
    className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  },
  opencode: {
    label: "OpenCode",
    className: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  },
};

interface HarnessBadgeProps {
  readonly harness: string;
  readonly className?: string;
}

/**
 * Small pill badge that identifies which agent harness produced a session.
 * Unknown harness kinds render a neutral pill with the raw kind string.
 */
export function HarnessBadge({ harness, className }: HarnessBadgeProps) {
  const meta = HARNESS_META[harness];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] leading-none",
        meta?.className ?? "bg-soft text-muted border border-line/40",
        className
      )}
      title={`Harness: ${harness}`}
    >
      {meta?.label ?? harness}
    </span>
  );
}

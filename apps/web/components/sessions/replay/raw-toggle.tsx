"use client";

import type { ReplayTurn } from "@control-plane/core";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  readonly turn: ReplayTurn;
};

/**
 * Renders a small "raw" toggle that exposes the full turn JSON. Collapsed by
 * default to keep the replay scannable.
 */
export function RawToggle({ turn }: Props) {
  const [open, setOpen] = useState(false);
  const pretty = JSON.stringify(turn, null, 2);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-semibold uppercase tracking-wide text-muted/60 hover:text-cyan"
      >
        {open ? "hide raw" : "raw"}
      </button>
      {open ? (
        <pre
          className={cn(
            "mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xs border border-line/60 bg-black/40 p-2 font-mono text-[11px] text-muted"
          )}
        >
          {pretty}
        </pre>
      ) : null}
    </div>
  );
}

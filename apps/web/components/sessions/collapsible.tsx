"use client";

import { useState } from "react";

type CollapsibleProps = {
  readonly preview: string;
  readonly full: string;
  readonly previewLabel?: string;
};

export function Collapsible({ preview, full, previewLabel = "Show more" }: CollapsibleProps) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = full.length > preview.length;

  return (
    <div>
      <pre className="whitespace-pre-wrap break-words rounded-xs border border-line/60 bg-black/20 px-3 py-2 font-mono text-xs text-ink">
        {expanded ? full : preview}
      </pre>
      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-medium text-cyan hover:underline"
        >
          {expanded ? "Show less" : previewLabel}
        </button>
      ) : null}
    </div>
  );
}

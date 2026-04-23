"use client";

import { formatTokens } from "@/lib/format";

interface Props {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export function TokenBreakdownBars({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
}: Props) {
  const total = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  const segs = [
    { label: "input", value: inputTokens, color: "#60a5fa" },
    { label: "output", value: outputTokens, color: "#d97706" },
    { label: "cache read", value: cacheReadTokens, color: "#34d399" },
    { label: "cache write", value: cacheCreationTokens, color: "#a78bfa" },
  ];

  if (total === 0) {
    return (
      <div
        role="img"
        aria-label="Token breakdown — no data"
        className="flex h-28 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted"
      >
        No token usage recorded yet
      </div>
    );
  }

  return (
    <div role="img" aria-label="Token breakdown by type" className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-soft/50">
        {segs.map((seg) => (
          <div
            key={seg.label}
            title={`${seg.label}: ${formatTokens(seg.value)}`}
            className="transition-all"
            style={{
              width: `${(seg.value / total) * 100}%`,
              minWidth: seg.value > 0 ? 2 : 0,
              backgroundColor: seg.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {segs.map((seg) => (
          <span key={seg.label} className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-xs text-muted">{seg.label}</span>
            <span
              className="font-mono text-[13px] font-semibold tabular-nums"
              style={{ color: seg.color }}
            >
              {formatTokens(seg.value)}
            </span>
            <span className="text-[11px] text-muted/70">
              {Math.round((seg.value / total) * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

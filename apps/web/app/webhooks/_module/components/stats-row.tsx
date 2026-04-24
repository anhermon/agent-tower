"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface StatsRowProps {
  readonly stats: {
    total24h: number;
    total24hTrend: number;
    activeProcessing: number;
    failedDlq: number;
    avgProcessingTime: number;
  };
}

export function StatsRow({ stats }: StatsRowProps) {
  const cards = [
    {
      label: "Total Events (24h)",
      value: stats.total24h,
      trend: stats.total24hTrend,
      highlight: false,
    },
    {
      label: "Active Processing",
      value: stats.activeProcessing,
      trend: null,
      highlight: stats.activeProcessing > 0,
    },
    {
      label: "Failed / DLQ",
      value: stats.failedDlq,
      trend: null,
      highlight: stats.failedDlq > 0,
    },
    {
      label: "Avg Processing Time",
      value: formatDuration(stats.avgProcessingTime),
      trend: null,
      highlight: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn("glass-panel rounded-lg p-4", card.highlight && "border-warn/50 bg-warn/5")}
        >
          <p className="eyebrow">{card.label}</p>
          <div className="mt-2 flex items-end gap-2">
            <p
              className={cn("text-2xl font-semibold", card.highlight ? "text-danger" : "text-ink")}
            >
              {card.value}
            </p>
            {card.trend !== null && card.trend !== 0 && (
              <span
                className={cn(
                  "mb-1 flex items-center gap-0.5 text-xs",
                  card.trend > 0 ? "text-ok" : "text-danger"
                )}
              >
                <Icon name={card.trend > 0 ? "trend-up" : "trend-down"} className="h-3 w-3" />
                {Math.abs(card.trend)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

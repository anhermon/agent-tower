import { Icon } from "@/components/ui/icon";

import type { Metric } from "@/types/control-plane";

interface MetricCardProps {
  metric: Metric;
  hero?: boolean;
}

export function MetricCard({ metric, hero = false }: MetricCardProps) {
  const trendIcon =
    metric.trend === "up" ? "trend-up" : metric.trend === "down" ? "trend-down" : "minus";
  const trendTone =
    metric.trend === "up" ? "text-ok" : metric.trend === "down" ? "text-danger" : "text-muted";

  return (
    <article
      className={`glass-panel relative min-h-32 rounded-md p-5 ${
        hero ? "accent-gradient-subtle" : ""
      }`}
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">{metric.label}</p>
          <Icon name={trendIcon} className={`h-4 w-4 shrink-0 ${trendTone}`} />
        </div>
        <div>
          <p className="text-3xl font-semibold tracking-tight text-ink md:text-[32px]">
            {metric.value}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">{metric.detail}</p>
        </div>
      </div>
    </article>
  );
}

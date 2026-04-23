import type { HealthState } from "@/types/control-plane";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function stateLabel(state: HealthState): string {
  const labels: Record<HealthState, string> = {
    healthy: "Healthy",
    degraded: "Degraded",
    down: "Down",
    idle: "Idle",
  };

  return labels[state];
}

// Colour tone applied to `.pill` / badges. The .pill class supplies the
// glowing dot from the `currentColor` text colour, so we only need the text
// colour here.
export function stateTone(state: HealthState): string {
  const tones: Record<HealthState, string> = {
    healthy: "text-ok",
    degraded: "text-warn",
    down: "text-danger",
    idle: "text-muted",
  };

  return tones[state];
}

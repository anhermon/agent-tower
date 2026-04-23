import { cn, stateLabel, stateTone } from "@/lib/utils";
import type { HealthState, ModulePhase } from "@/types/control-plane";

type BadgeProps = {
  state: HealthState;
  className?: string;
};

export function Badge({ state, className }: BadgeProps) {
  return (
    <span className={cn("pill", stateTone(state), className)}>{stateLabel(state)}</span>
  );
}

type PhaseBadgeProps = {
  phase: ModulePhase;
  className?: string;
};

const PHASE_LABELS: Record<ModulePhase, string> = {
  active: "Active",
  skeleton: "Skeleton",
  deferred: "Deferred"
};

// Phase uses its own tone mapping separate from HealthState so "deferred"
// is visually distinct from "degraded" (which is about adapter health).
const PHASE_TONES: Record<ModulePhase, string> = {
  active: "text-ok",
  skeleton: "text-info",
  deferred: "text-muted"
};

export function PhaseBadge({ phase, className }: PhaseBadgeProps) {
  return (
    <span className={cn("pill", PHASE_TONES[phase], className)}>{PHASE_LABELS[phase]}</span>
  );
}

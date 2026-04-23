export type HealthState = "healthy" | "degraded" | "down" | "idle";

export type ModuleKey =
  | "overview"
  | "sessions"
  | "webhooks"
  | "agents"
  | "kanban"
  | "skills"
  | "mcps"
  | "channels"
  | "replay";

export type ModuleIcon =
  | "grid"
  | "terminal"
  | "hook"
  | "agent"
  | "board"
  | "bolt"
  | "plug"
  | "signal"
  | "replay";

export type ModulePhase = "skeleton" | "active" | "deferred";

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  href: string;
  icon: ModuleIcon;
  description: string;
  status: HealthState;
  /** Delivery phase: where this module sits relative to the Phase 1 skeleton. */
  phase: ModulePhase;
  /** Human or role accountable for the module. Empty string when unassigned. */
  owner: string;
  /** Path (repo-relative) to the module's product/UX spec. */
  docs: string;
}

export interface Metric {
  label: string;
  value: string;
  detail: string;
  trend: "up" | "down" | "flat";
}

export interface ActivityEvent {
  id: string;
  module: ModuleKey;
  title: string;
  detail: string;
  timestamp: string;
  state: HealthState;
}

export interface PlaceholderRecord {
  id: string;
  name: string;
  status: HealthState;
  owner: string;
  updatedAt: string;
}

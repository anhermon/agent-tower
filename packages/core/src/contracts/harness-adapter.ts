import type { AdapterContext, AdapterHealth, AdapterLifecycle } from "./common.js";
import type { CostBreakdown, DateRange, Timeseries, ToolAnalytics } from "../domain/analytics.js";
import type { ProjectSummary } from "../domain/projects.js";
import type { ReplayData } from "../domain/replay.js";
import type { SessionUsageSummary } from "../domain/sessions.js";
import type { SessionAnalyticsFilter } from "./session-analytics-adapter.js";

/**
 * Stable metadata that identifies a harness (the runtime shell / CLI tool
 * that hosts the AI coding assistant, e.g. Claude Code, Codex CLI, OpenCode).
 *
 * The `kind` value is the canonical identifier used in session badges, CLI
 * flags, and MCP params — keep it stable and lowercase-kebab.
 */
export interface HarnessDescriptor {
  /** Stable programmatic identifier. E.g. "claude-code", "codex", "opencode". */
  readonly kind: string;
  /** Human-readable display name. E.g. "Claude Code", "Codex CLI", "OpenCode". */
  readonly displayName: string;
  /** Absolute filesystem path where this harness stores session data. */
  readonly dataRoot: string;
}

/**
 * Typed contract every harness adapter must implement.
 *
 * A `HarnessAdapter` is a `SessionAnalyticsSource` extended with a
 * `descriptor` that carries harness identity. Registering a new harness
 * requires one file that:
 *   1. Implements `HarnessAdapter`.
 *   2. Registers an instance with `AdapterRegistry`.
 *
 * All read methods must be tolerant of missing / empty data roots — they
 * should return empty arrays rather than throwing.
 */
export interface HarnessAdapter extends AdapterLifecycle {
  /** Stable descriptor for this harness. Never mutated after construction. */
  readonly descriptor: HarnessDescriptor;

  listProjectSummaries(context?: AdapterContext): Promise<readonly ProjectSummary[]>;

  listSessionSummaries(
    filter?: SessionAnalyticsFilter,
    context?: AdapterContext
  ): Promise<readonly SessionUsageSummary[]>;

  loadSessionUsage(
    sessionId: string,
    context?: AdapterContext
  ): Promise<SessionUsageSummary | undefined>;

  loadSessionReplay(sessionId: string, context?: AdapterContext): Promise<ReplayData | undefined>;

  loadActivityTimeseries(range?: DateRange, context?: AdapterContext): Promise<Timeseries>;

  loadCostBreakdown(range?: DateRange, context?: AdapterContext): Promise<CostBreakdown>;

  loadToolAnalytics(context?: AdapterContext): Promise<ToolAnalytics>;

  health?(context?: AdapterContext): Promise<AdapterHealth>;
}

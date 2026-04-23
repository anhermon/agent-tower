import type { CacheEfficiency, ModelUsage } from "./costs.js";
import type { SessionDerivedFlags } from "./sessions.js";

// ─── Phase 1 Wave 0: sessions-superset additions ──────────────────────────────
// Canonical rollup of sessions grouped by the resolved working directory
// (`cwd`). Adapter-agnostic — any session source that can provide the fields
// referenced below can emit a `ProjectSummary`.

/**
 * Canonical project-level rollup, aggregated from one or more session
 * summaries. `id` is the adapter-stable slug under which sessions are grouped
 * (for the Claude Code adapter this is the on-disk directory name).
 *
 * `flags` is the OR-reduction of the member sessions' flags: true iff at least
 * one session under the project has the feature.
 */
export interface ProjectSummary {
  readonly id: string;
  readonly displayPath: string;
  readonly displayName: string;
  readonly sessionCount: number;
  readonly firstActive: string;
  readonly lastActive: string;
  readonly totalDurationMs: number;
  readonly totalMessages: number;
  readonly estimatedCostUsd: number;
  readonly usage: ModelUsage;
  readonly cacheEfficiency: CacheEfficiency;
  readonly toolCounts: Readonly<Record<string, number>>;
  readonly languages: Readonly<Record<string, number>>;
  readonly branches: readonly string[];
  readonly flags: SessionDerivedFlags;
}

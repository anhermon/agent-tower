// ─── Phase 1 Wave 5: sessions-superset additions ──────────────────────────────
// Canonical shapes for the cross-cutting surfaces that land in Wave 5:
//   - full-text search results
//   - live file-watch event envelopes emitted over SSE
//   - canonical export bundle
// All purely additive — existing consumers of `@control-plane/core` keep
// working unchanged.

import type { CostBreakdown } from "./analytics.js";
import type { ProjectSummary } from "./projects.js";
import type {
  SessionCompactionEvent,
  SessionDerivedFlags,
  SessionUsageSummary,
} from "./sessions.js";

// ─── Full-text search ─────────────────────────────────────────────────────────

/**
 * A single hit returned by the global search endpoint. One hit per matched
 * turn within a session. `snippet` is a short excerpt centered on the first
 * occurrence of the query inside the matched turn; the server never returns
 * raw file content — only the minimal context a human would expect to see in
 * a palette.
 */
export interface SessionSearchHit {
  readonly sessionId: string;
  /** Stable project directory slug (adapter-specific but opaque to the UI). */
  readonly projectSlug: string;
  /** The turn uuid the match was found inside. */
  readonly turnId: string;
  /**
   * A short excerpt (≤ ~160 chars) centered on the first occurrence of the
   * query inside the matched turn. Consumers render this as preformatted text.
   */
  readonly snippet: string;
  /** Score is currently a simple count of query occurrences inside the turn. */
  readonly score: number;
}

// ─── Live fs-watch events ─────────────────────────────────────────────────────

/**
 * Live event envelope emitted by `/api/events` (SSE) whenever on-disk session
 * data changes. Consumers decide what to do with them; the server does not
 * fabricate events — every envelope corresponds to a real filesystem event.
 */
export type SessionLiveEvent =
  | {
      readonly type: "session-created";
      readonly sessionId: string;
      readonly projectSlug: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: "session-appended";
      readonly sessionId: string;
      readonly projectSlug: string;
      readonly occurredAt: string;
    };

// ─── Canonical export bundle ──────────────────────────────────────────────────

/**
 * Stable, typed export bundle emitted by `/api/sessions/export`. Intentionally
 * NOT a cc-lens `.ccboard.json` — this is built on canonical control-plane
 * types. Consumers can pipe these into another dashboard, a notebook, or a
 * backup without parsing adapter-shaped payloads.
 */
export interface SessionExportBundle {
  /** Bump when a non-additive change lands; additive fields do not bump. */
  readonly version: 1;
  /** ISO8601 timestamp at which the bundle was produced. */
  readonly exportedAt: string;
  /** Optional filter echoed back so the import side knows the scope. */
  readonly scope: SessionExportScope;
  /** Per-session metadata + flags rollup. */
  readonly sessions: readonly SessionExportRow[];
  /** Cross-session cost breakdown. Matches the canonical analytics shape. */
  readonly costs: CostBreakdown;
  /** Per-project rollup snapshots. */
  readonly projects: readonly ProjectSummary[];
}

export interface SessionExportScope {
  readonly kind: "session" | "project" | "all";
  readonly ids?: readonly string[];
  readonly from?: string;
  readonly to?: string;
}

/** One row per included session. All fields are a strict subset of canonical types. */
export interface SessionExportRow {
  readonly summary: SessionUsageSummary;
  readonly flags: SessionDerivedFlags;
  readonly compactions: readonly SessionCompactionEvent[];
}

import "server-only";
import {
  buildAdapterRegistry,
  CLAUDE_DATA_ROOT_ENV,
  ClaudeCodeAnalyticsSource,
  ClaudeCodeSessionSource,
  type ClaudeSessionFile,
  type DataRootOrigin,
  getConfiguredDataRoot,
  type NormalizedTranscript,
  type ResolvedDataRoot,
  readTranscriptPreview,
  resolveDataRoot,
  type TranscriptPreview,
} from "@control-plane/adapter-claude-code";
import type { AdapterRegistry } from "@control-plane/core";
import type {
  CostBreakdown,
  DateRange,
  ProjectSummary,
  ReplayData,
  SessionDerivedFlags,
  SessionUsageSummary,
  Timeseries,
  ToolAnalytics,
} from "@control-plane/core";

/**
 * Thin Next.js wrapper around the shared data-root resolution + analytics
 * source. The canonical implementation lives in
 * `@control-plane/adapter-claude-code` so the `cp` CLI and MCP server can
 * reuse it.
 *
 * Resolution order (inherited):
 *   1. `CLAUDE_CONTROL_PLANE_DATA_ROOT` environment variable.
 *   2. `~/.claude/projects` if it exists.
 *   3. `null` → UI renders an empty state with configuration guidance.
 */

export type { DataRootOrigin, ResolvedDataRoot };
export { CLAUDE_DATA_ROOT_ENV, getConfiguredDataRoot, resolveDataRoot };

export function getConfiguredSessionSource(): ClaudeCodeSessionSource | null {
  const resolved = resolveDataRoot();
  if (!resolved) {
    return null;
  }
  return new ClaudeCodeSessionSource({ directory: resolved.directory });
}

// Wave 0 addition — single shared analytics adapter instance per process, so
// the in-memory mtime cache is reused across renders. Created lazily on the
// first read; destroyed on module reload during dev via Next's HMR.
let analyticsCache: {
  readonly directory: string;
  readonly source: ClaudeCodeAnalyticsSource;
} | null = null;

export function getConfiguredAnalyticsSource(): ClaudeCodeAnalyticsSource | null {
  const resolved = resolveDataRoot();
  if (!resolved) {
    analyticsCache = null;
    return null;
  }
  if (analyticsCache?.directory === resolved.directory) {
    return analyticsCache.source;
  }
  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  analyticsCache = { directory: resolved.directory, source };
  return source;
}

// ─── Multi-harness registry (singleton per process) ──────────────────────────
// Lazily built once on the first request, then reused. The registry itself has
// no stale state — each adapter re-reads the filesystem on every call.

let registryCache: AdapterRegistry | null = null;

export function getAdapterRegistry(): AdapterRegistry {
  if (!registryCache) {
    registryCache = buildAdapterRegistry();
  }
  return registryCache;
}

export interface SessionListing extends ClaudeSessionFile {
  readonly title: string | null;
  readonly firstUserText: string | null;
  readonly model: string | null;
  readonly turnCountLowerBound: number;
  readonly flags?: SessionDerivedFlags;
  readonly estimatedCostUsd?: number;
  readonly durationMs?: number;
  readonly messageCount?: number;
  /** Harness that produced this session (e.g. "claude-code", "codex"). */
  readonly harness?: string;
}

export type ListSessionsResult =
  | { readonly ok: true; readonly sessions: readonly SessionListing[] }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "error";
      readonly message?: string;
    };

export async function listSessionsOrEmpty(): Promise<ListSessionsResult> {
  const source = getConfiguredSessionSource();
  if (!source) {
    return { ok: false, reason: "unconfigured" };
  }
  try {
    const files = await source.listSessions();
    const previews = await enrichWithPreviews(files);
    const enriched = await enrichWithUsageSummaries(previews);
    return { ok: true, sessions: enriched };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: errorMessage(error),
    };
  }
}

// Cache previews across requests in the same Node process. Keyed by file path +
// mtime so edits to a transcript invalidate the entry automatically.
const previewCache = new Map<string, TranscriptPreview>();

async function enrichWithPreviews(
  files: readonly ClaudeSessionFile[]
): Promise<readonly SessionListing[]> {
  const concurrency = 24;
  // Allocate a sparse slot per input file. `new Array(n)` types as `any[]`,
  // which defeats type-aware lint rules — construct the slot array as
  // `SessionListing[]` directly.
  const results: SessionListing[] = [];
  results.length = files.length;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= files.length) return;
      const file = files[index];
      const cacheKey = `${file.filePath}:${file.modifiedAt}`;
      let preview = previewCache.get(cacheKey);
      if (!preview) {
        try {
          preview = await readTranscriptPreview(file.filePath, { maxLines: 30 });
          previewCache.set(cacheKey, preview);
        } catch {
          preview = {
            title: null,
            firstUserText: null,
            summary: null,
            model: null,
            firstTimestamp: null,
            turnCountLowerBound: 0,
          };
        }
      }
      results[index] = {
        ...file,
        title: preview.title,
        firstUserText: preview.firstUserText,
        model: preview.model,
        turnCountLowerBound: preview.turnCountLowerBound,
      };
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return results;
}

async function enrichWithUsageSummaries(
  listings: readonly SessionListing[]
): Promise<readonly SessionListing[]> {
  if (listings.length === 0) {
    return listings;
  }

  // Use the multi-harness registry — it includes Claude Code + Codex + any
  // future adapters. Falls back gracefully if the registry has no adapters.
  const registry = getAdapterRegistry();

  try {
    const summaries = await registry.listAllSessionSummaries();
    const bySessionId = new Map(summaries.map((summary) => [summary.sessionId, summary]));
    return listings.map((listing) => {
      const summary = bySessionId.get(listing.sessionId);
      if (!summary) {
        return listing;
      }
      return {
        ...listing,
        model: listing.model ?? summary.model ?? null,
        flags: summary.flags,
        estimatedCostUsd: summary.estimatedCostUsd,
        durationMs: summary.durationMs,
        messageCount: summary.userMessageCount + summary.assistantMessageCount,
        harness: summary.harness,
      };
    });
  } catch {
    return listings;
  }
}

export type LoadSessionResult =
  | { readonly ok: true; readonly transcript: NormalizedTranscript }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "not_found" | "error";
      readonly message?: string;
    };

export async function loadSessionOrUndefined(id: string): Promise<LoadSessionResult> {
  const source = getConfiguredSessionSource();
  if (!source) {
    return { ok: false, reason: "unconfigured" };
  }
  try {
    const transcript = await source.loadSession(id);
    if (!transcript) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true, transcript };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: errorMessage(error),
    };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// ─── Wave 0 — canonical analytics surfaces ────────────────────────────────────
// Thin `{ ok, value } | { ok: false, reason }` wrappers that the UI can use
// without importing the adapter directly. No UI file changes in Wave 0 —
// these exist for Wave 1 to call.

interface Unconfigured {
  readonly ok: false;
  readonly reason: "unconfigured";
}
interface ErrResult {
  readonly ok: false;
  readonly reason: "error";
  readonly message: string;
}
interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
type Result<T> = Ok<T> | Unconfigured | ErrResult;

function errResult(error: unknown): ErrResult {
  return { ok: false, reason: "error", message: errorMessage(error) };
}

export async function listProjectSummariesOrEmpty(): Promise<Result<readonly ProjectSummary[]>> {
  const src = getConfiguredAnalyticsSource();
  if (!src) return { ok: false, reason: "unconfigured" };
  try {
    return { ok: true, value: await src.listProjectSummaries() };
  } catch (error) {
    return errResult(error);
  }
}

export async function listSessionSummariesOrEmpty(filter?: {
  projectId?: string;
  range?: DateRange;
  harness?: string;
}): Promise<Result<readonly SessionUsageSummary[]>> {
  const registry = getAdapterRegistry();
  try {
    let summaries = await registry.listAllSessionSummaries(filter);
    if (filter?.harness) {
      summaries = summaries.filter((s) => s.harness === filter.harness);
    }
    return { ok: true, value: summaries };
  } catch (error) {
    return errResult(error);
  }
}

export async function loadSessionUsageOrEmpty(
  id: string
): Promise<Result<SessionUsageSummary | undefined>> {
  const src = getConfiguredAnalyticsSource();
  if (!src) return { ok: false, reason: "unconfigured" };
  try {
    return { ok: true, value: await src.loadSessionUsage(id) };
  } catch (error) {
    return errResult(error);
  }
}

export async function loadSessionReplayOrEmpty(
  id: string
): Promise<Result<ReplayData | undefined>> {
  const src = getConfiguredAnalyticsSource();
  if (!src) return { ok: false, reason: "unconfigured" };
  try {
    return { ok: true, value: await src.loadSessionReplay(id) };
  } catch (error) {
    return errResult(error);
  }
}

export async function loadActivityTimeseriesOrEmpty(
  range?: DateRange
): Promise<Result<Timeseries>> {
  const src = getConfiguredAnalyticsSource();
  if (!src) return { ok: false, reason: "unconfigured" };
  try {
    return { ok: true, value: await src.loadActivityTimeseries(range) };
  } catch (error) {
    return errResult(error);
  }
}

export async function loadCostBreakdownOrEmpty(range?: DateRange): Promise<Result<CostBreakdown>> {
  const src = getConfiguredAnalyticsSource();
  if (!src) return { ok: false, reason: "unconfigured" };
  try {
    return { ok: true, value: await src.loadCostBreakdown(range) };
  } catch (error) {
    return errResult(error);
  }
}

export async function loadToolAnalyticsOrEmpty(): Promise<Result<ToolAnalytics>> {
  const src = getConfiguredAnalyticsSource();
  if (!src) return { ok: false, reason: "unconfigured" };
  try {
    return { ok: true, value: await src.loadToolAnalytics() };
  } catch (error) {
    return errResult(error);
  }
}

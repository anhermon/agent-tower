import "server-only";
import type {
  CostBreakdown,
  DateRange,
  ProjectSummary,
  ReplayData,
  SessionAnalyticsSource,
  SessionUsageSummary,
  Timeseries,
  ToolAnalytics,
} from "@control-plane/core";

import { getConfiguredAnalyticsSource } from "./sessions-source";

/**
 * Thin server-only wrapper around the `SessionAnalyticsSource` contract. All
 * public entry points return a `Result<T>` shape mirroring `sessions-source.ts`
 * so UI code can combine the two without per-call branching.
 *
 * This file is pure wiring — no business logic. Folds live in the adapter.
 */

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
export type Result<T> = Ok<T> | Unconfigured | ErrResult;

export interface AnalyticsOverview {
  readonly sessionCount: number;
  readonly messageCount: number;
  readonly toolCallCount: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalCacheCreationTokens: number;
  readonly estimatedCostUsd: number;
  readonly timeseries: Timeseries;
}

export interface ProjectDetail {
  readonly project: ProjectSummary;
  readonly sessions: readonly SessionUsageSummary[];
}

// ─── Test seam ───────────────────────────────────────────────────────────────
// Allows tests to inject a fake `SessionAnalyticsSource` without touching the
// filesystem. Production code always resolves via `getConfiguredAnalyticsSource`.

type SourceResolver = () => SessionAnalyticsSource | null;

let resolveSource: SourceResolver = getConfiguredAnalyticsSource;

export function __setAnalyticsSourceResolverForTests(resolver: SourceResolver | null): void {
  resolveSource = resolver ?? getConfiguredAnalyticsSource;
}

function errResult(error: unknown): ErrResult {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, reason: "error", message };
}

async function withSource<T>(fn: (src: SessionAnalyticsSource) => Promise<T>): Promise<Result<T>> {
  const src = resolveSource();
  if (!src) return { ok: false, reason: "unconfigured" };
  try {
    return { ok: true, value: await fn(src) };
  } catch (error) {
    return errResult(error);
  }
}

// ─── Public entry points ─────────────────────────────────────────────────────

export async function getOverview(range?: DateRange): Promise<Result<AnalyticsOverview>> {
  return withSource(async (src) => {
    const [sessions, timeseries, costBreakdown] = await Promise.all([
      src.listSessionSummaries(range ? { range } : undefined),
      src.loadActivityTimeseries(range),
      src.loadCostBreakdown(range),
    ]);

    let messageCount = 0;
    let toolCallCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;

    for (const session of sessions) {
      messageCount += session.userMessageCount + session.assistantMessageCount;
      for (const count of Object.values(session.toolCounts)) {
        toolCallCount += count;
      }
      inputTokens += session.usage.inputTokens;
      outputTokens += session.usage.outputTokens;
      cacheReadTokens += session.usage.cacheReadInputTokens;
      cacheCreationTokens += session.usage.cacheCreationInputTokens;
    }

    return {
      sessionCount: sessions.length,
      messageCount,
      toolCallCount,
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalCacheReadTokens: cacheReadTokens,
      totalCacheCreationTokens: cacheCreationTokens,
      estimatedCostUsd: costBreakdown.totalUsd,
      timeseries,
    } satisfies AnalyticsOverview;
  });
}

export async function listProjects(): Promise<Result<readonly ProjectSummary[]>> {
  return withSource((src) => src.listProjectSummaries());
}

export async function loadProject(slug: string): Promise<Result<ProjectDetail | undefined>> {
  return withSource(async (src) => {
    const [projects, sessions] = await Promise.all([
      src.listProjectSummaries(),
      src.listSessionSummaries({ projectId: slug }),
    ]);
    const project = projects.find((p) => p.id === slug);
    if (!project) return undefined;
    return { project, sessions } satisfies ProjectDetail;
  });
}

export async function loadReplay(sessionId: string): Promise<Result<ReplayData | undefined>> {
  return withSource((src) => src.loadSessionReplay(sessionId));
}

export async function getCostBreakdown(range?: DateRange): Promise<Result<CostBreakdown>> {
  return withSource((src) => src.loadCostBreakdown(range));
}

export async function getToolAnalytics(): Promise<Result<ToolAnalytics>> {
  return withSource((src) => src.loadToolAnalytics());
}

export async function getActivity(range?: DateRange): Promise<Result<Timeseries>> {
  return withSource((src) => src.loadActivityTimeseries(range));
}

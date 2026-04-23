import path from "node:path";

import {
  type CacheEfficiency,
  cacheEfficiency,
  EMPTY_CACHE_EFFICIENCY,
  type ModelUsage,
  type ProjectSummary,
  type SessionDerivedFlags,
  type SessionUsageSummary,
} from "@control-plane/core";

export interface ProjectGrouping {
  /** Adapter-stable slug: for Claude Code this is the on-disk project dir
   *  name (the cwd-derived form like `-Users-you-workspace-foo`). */
  readonly id: string;
  /** Session summaries grouped under this project. */
  readonly sessions: readonly SessionUsageSummary[];
  /** Optional explicit display path to override the cwd-derived heuristic. */
  readonly displayPath?: string;
}

interface ProjectAccumulator {
  usage: Mutable<ModelUsage>;
  flags: Mutable<SessionDerivedFlags>;
  toolCounts: Record<string, number>;
  branches: Set<string>;
  modelHits: Map<string, number>;
  totalDurationMs: number;
  totalMessages: number;
  estimatedCostUsd: number;
  firstActive: string | undefined;
  lastActive: string | undefined;
}

function makeAccumulator(): ProjectAccumulator {
  return {
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
    flags: {
      hasCompaction: false,
      hasThinking: false,
      usesTaskAgent: false,
      usesMcp: false,
      usesWebSearch: false,
      usesWebFetch: false,
    },
    toolCounts: {},
    branches: new Set(),
    modelHits: new Map(),
    totalDurationMs: 0,
    totalMessages: 0,
    estimatedCostUsd: 0,
    firstActive: undefined,
    lastActive: undefined,
  };
}

function accumulateSessionIntoProject(acc: ProjectAccumulator, s: SessionUsageSummary): void {
  acc.usage.inputTokens += s.usage.inputTokens;
  acc.usage.outputTokens += s.usage.outputTokens;
  acc.usage.cacheReadInputTokens += s.usage.cacheReadInputTokens;
  acc.usage.cacheCreationInputTokens += s.usage.cacheCreationInputTokens;
  acc.estimatedCostUsd += s.estimatedCostUsd;
  acc.totalMessages += s.userMessageCount + s.assistantMessageCount;
  acc.totalDurationMs += s.durationMs ?? 0;
  if (s.startTime && (!acc.firstActive || s.startTime < acc.firstActive))
    acc.firstActive = s.startTime;
  if (s.endTime && (!acc.lastActive || s.endTime > acc.lastActive)) acc.lastActive = s.endTime;
  if (s.gitBranch) acc.branches.add(s.gitBranch);
  mergeFlags(acc.flags, s.flags);
  for (const [tool, count] of Object.entries(s.toolCounts)) {
    acc.toolCounts[tool] = (acc.toolCounts[tool] ?? 0) + count;
  }
  if (s.model) {
    acc.modelHits.set(s.model, (acc.modelHits.get(s.model) ?? 0) + 1);
  }
}

function mergeFlags(dst: Mutable<SessionDerivedFlags>, src: SessionDerivedFlags): void {
  dst.hasCompaction = dst.hasCompaction || src.hasCompaction;
  dst.hasThinking = dst.hasThinking || src.hasThinking;
  dst.usesTaskAgent = dst.usesTaskAgent || src.usesTaskAgent;
  dst.usesMcp = dst.usesMcp || src.usesMcp;
  dst.usesWebSearch = dst.usesWebSearch || src.usesWebSearch;
  dst.usesWebFetch = dst.usesWebFetch || src.usesWebFetch;
}

function selectDominantModel(modelHits: Map<string, number>): string | null {
  let dominantModel: string | null = null;
  let dominantCount = -1;
  for (const [model, hits] of modelHits) {
    if (hits > dominantCount) {
      dominantCount = hits;
      dominantModel = model;
    }
  }
  return dominantModel;
}

/**
 * Fold a set of per-session summaries into a `ProjectSummary`. Pure: no
 * filesystem reads, no external state. Accepts pre-grouped input so callers
 * decide how sessions map to projects.
 */
export function foldProjectSummary(group: ProjectGrouping): ProjectSummary {
  const sessions = group.sessions;
  const cwd = group.displayPath ?? inferDisplayPath(sessions) ?? decodeSlug(group.id);

  const acc = makeAccumulator();
  for (const s of sessions) {
    accumulateSessionIntoProject(acc, s);
  }

  const dominantModel = selectDominantModel(acc.modelHits);
  const efficiency: CacheEfficiency = dominantModel
    ? cacheEfficiency(dominantModel, acc.usage)
    : EMPTY_CACHE_EFFICIENCY;

  const displayPath = cwd;
  const displayName = path.basename(displayPath || group.id) || group.id;

  return {
    id: group.id,
    displayPath,
    displayName,
    sessionCount: sessions.length,
    firstActive: acc.firstActive ?? "",
    lastActive: acc.lastActive ?? "",
    totalDurationMs: acc.totalDurationMs,
    totalMessages: acc.totalMessages,
    estimatedCostUsd: acc.estimatedCostUsd,
    usage: acc.usage,
    cacheEfficiency: efficiency,
    toolCounts: acc.toolCounts,
    languages: {},
    branches: Array.from(acc.branches).sort(),
    flags: acc.flags,
  };
}

/**
 * Group session summaries by a key function and fold each into a
 * `ProjectSummary`. Convenience wrapper around `foldProjectSummary`.
 */
export function foldProjectSummaries(
  sessions: readonly SessionUsageSummary[],
  keyFor: (s: SessionUsageSummary) => string,
  displayPathFor?: (id: string, sessions: readonly SessionUsageSummary[]) => string | undefined
): readonly ProjectSummary[] {
  const groups = new Map<string, SessionUsageSummary[]>();
  for (const s of sessions) {
    const id = keyFor(s);
    const arr = groups.get(id) ?? [];
    arr.push(s);
    groups.set(id, arr);
  }
  const result: ProjectSummary[] = [];
  for (const [id, group] of groups) {
    const summary = foldProjectSummary({
      id,
      sessions: group,
      ...(displayPathFor ? { displayPath: displayPathFor(id, group) ?? "" } : {}),
    });
    result.push(summary);
  }
  result.sort((a, b) => (a.lastActive < b.lastActive ? 1 : -1));
  return result;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function inferDisplayPath(sessions: readonly SessionUsageSummary[]): string | undefined {
  for (const s of sessions) {
    if (s.cwd) return s.cwd;
  }
  return undefined;
}

/**
 * Claude Code encodes cwd as a filesystem slug by replacing `/` with `-`. We
 * reverse this only for display, never for filesystem lookups.
 */
function decodeSlug(slug: string): string {
  if (!slug.startsWith("-")) return slug;
  return slug.replace(/^-/, "/").replace(/-/g, "/");
}

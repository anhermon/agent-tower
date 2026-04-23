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

/**
 * Fold a set of per-session summaries into a `ProjectSummary`. Pure: no
 * filesystem reads, no external state. Accepts pre-grouped input so callers
 * decide how sessions map to projects.
 */
export function foldProjectSummary(group: ProjectGrouping): ProjectSummary {
  const sessions = group.sessions;
  const cwd = group.displayPath ?? inferDisplayPath(sessions) ?? decodeSlug(group.id);

  const usage: Mutable<ModelUsage> = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  const flags: Mutable<SessionDerivedFlags> = {
    hasCompaction: false,
    hasThinking: false,
    usesTaskAgent: false,
    usesMcp: false,
    usesWebSearch: false,
    usesWebFetch: false,
  };
  const toolCounts: Record<string, number> = {};
  const branches = new Set<string>();
  let totalDurationMs = 0;
  let totalMessages = 0;
  let estimatedCostUsd = 0;
  let firstActive: string | undefined;
  let lastActive: string | undefined;
  let dominantModel: string | null = null;
  const modelHits = new Map<string, number>();

  for (const s of sessions) {
    usage.inputTokens += s.usage.inputTokens;
    usage.outputTokens += s.usage.outputTokens;
    usage.cacheReadInputTokens += s.usage.cacheReadInputTokens;
    usage.cacheCreationInputTokens += s.usage.cacheCreationInputTokens;
    estimatedCostUsd += s.estimatedCostUsd;
    totalMessages += s.userMessageCount + s.assistantMessageCount;
    totalDurationMs += s.durationMs ?? 0;
    if (s.startTime && (!firstActive || s.startTime < firstActive)) firstActive = s.startTime;
    if (s.endTime && (!lastActive || s.endTime > lastActive)) lastActive = s.endTime;
    if (s.gitBranch) branches.add(s.gitBranch);
    flags.hasCompaction = flags.hasCompaction || s.flags.hasCompaction;
    flags.hasThinking = flags.hasThinking || s.flags.hasThinking;
    flags.usesTaskAgent = flags.usesTaskAgent || s.flags.usesTaskAgent;
    flags.usesMcp = flags.usesMcp || s.flags.usesMcp;
    flags.usesWebSearch = flags.usesWebSearch || s.flags.usesWebSearch;
    flags.usesWebFetch = flags.usesWebFetch || s.flags.usesWebFetch;
    for (const [tool, count] of Object.entries(s.toolCounts)) {
      toolCounts[tool] = (toolCounts[tool] ?? 0) + count;
    }
    if (s.model) {
      modelHits.set(s.model, (modelHits.get(s.model) ?? 0) + 1);
    }
  }

  for (const [model, hits] of modelHits) {
    const currentCount = dominantModel ? (modelHits.get(dominantModel) ?? 0) : -1;
    if (hits > currentCount) dominantModel = model;
  }

  const efficiency: CacheEfficiency = dominantModel
    ? cacheEfficiency(dominantModel, usage)
    : EMPTY_CACHE_EFFICIENCY;

  const displayPath = cwd;
  const displayName = path.basename(displayPath || group.id) || group.id;

  return {
    id: group.id,
    displayPath,
    displayName,
    sessionCount: sessions.length,
    firstActive: firstActive ?? "",
    lastActive: lastActive ?? "",
    totalDurationMs,
    totalMessages,
    estimatedCostUsd,
    usage,
    cacheEfficiency: efficiency,
    toolCounts,
    languages: {},
    branches: Array.from(branches).sort(),
    flags,
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

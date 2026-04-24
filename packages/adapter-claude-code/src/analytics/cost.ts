import {
  type CacheEfficiency,
  type CostBreakdown,
  cacheEfficiency,
  type DailyCostPoint,
  type DateRange,
  EMPTY_CACHE_EFFICIENCY,
  estimateCostFromModelUsage,
  type ModelCostBreakdown,
  type ModelUsage,
  type ProjectCostRow,
  type SessionUsageSummary,
} from "@control-plane/core";

export interface CostFoldOptions {
  readonly range?: DateRange;
  /** Maps a session to a project id + displayName for per-project rollups.
   *  Defaults to grouping by `session.cwd`. */
  readonly projectKey?: (s: SessionUsageSummary) => {
    readonly id: string;
    readonly displayName: string;
  };
}

/**
 * Pure cost breakdown fold. Returns per-model, per-day, per-project cost
 * rollups plus an overall cache-efficiency summary. Unknown models use the
 * pricing fallback (upper-bound). No I/O, no clocks.
 */
export function foldCostBreakdown(
  sessions: readonly SessionUsageSummary[],
  options: CostFoldOptions = {}
): CostBreakdown {
  const byModelUsage = new Map<string, Mutable<ModelUsage>>();
  const byModelCost = new Map<string, number>();
  const daily = new Map<string, { total: number; models: Record<string, number> }>();
  const byProject = new Map<
    string,
    { displayName: string; cost: number; usage: Mutable<ModelUsage> }
  >();
  let totalUsd = 0;
  let minDate: string | undefined;
  let maxDate: string | undefined;

  // Overall usage used to compute a blended cache efficiency (weighted by the
  // dominant model's pricing — this matches cc-lens's per-model panel where
  // the overall card uses the dominant model as a reference).
  const overallUsage: Mutable<ModelUsage> = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  let dominantModel: string | null = null;
  let dominantHits = 0;

  for (const s of sessions) {
    if (s.model) {
      const hits = (byModelUsage.get(s.model)?.inputTokens ?? 0) + s.usage.inputTokens;
      if (hits > dominantHits) {
        dominantHits = hits;
        dominantModel = s.model;
      }
      const u = byModelUsage.get(s.model) ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      };
      u.inputTokens += s.usage.inputTokens;
      u.outputTokens += s.usage.outputTokens;
      u.cacheReadInputTokens += s.usage.cacheReadInputTokens;
      u.cacheCreationInputTokens += s.usage.cacheCreationInputTokens;
      byModelUsage.set(s.model, u);

      byModelCost.set(s.model, (byModelCost.get(s.model) ?? 0) + s.estimatedCostUsd);
    }
    overallUsage.inputTokens += s.usage.inputTokens;
    overallUsage.outputTokens += s.usage.outputTokens;
    overallUsage.cacheReadInputTokens += s.usage.cacheReadInputTokens;
    overallUsage.cacheCreationInputTokens += s.usage.cacheCreationInputTokens;
    totalUsd += s.estimatedCostUsd;

    // Daily breakdown
    if (s.startTime) {
      const date = s.startTime.slice(0, 10);
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
      const bucket = daily.get(date) ?? { total: 0, models: {} };
      bucket.total += s.estimatedCostUsd;
      if (s.model) {
        bucket.models[s.model] = (bucket.models[s.model] ?? 0) + s.estimatedCostUsd;
      }
      daily.set(date, bucket);
    }

    // Per-project breakdown
    const projectKey = options.projectKey ? options.projectKey(s) : defaultProjectKey(s);
    const p = byProject.get(projectKey.id) ?? {
      displayName: projectKey.displayName,
      cost: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    };
    p.cost += s.estimatedCostUsd;
    p.usage.inputTokens += s.usage.inputTokens;
    p.usage.outputTokens += s.usage.outputTokens;
    p.usage.cacheReadInputTokens += s.usage.cacheReadInputTokens;
    p.usage.cacheCreationInputTokens += s.usage.cacheCreationInputTokens;
    byProject.set(projectKey.id, p);
  }

  const models: ModelCostBreakdown[] = [];
  for (const [model, usage] of byModelUsage) {
    const cost = byModelCost.get(model) ?? estimateCostFromModelUsage(model, usage);
    models.push({
      model,
      usage,
      estimatedCostUsd: cost,
      cacheEfficiency: cacheEfficiency(model, usage),
    });
  }
  models.sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  const dailyArr: DailyCostPoint[] = [...daily.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, totalUsd: v.total, byModel: v.models }));

  const projectArr: ProjectCostRow[] = [...byProject.entries()]
    .map(([id, v]) => ({
      projectId: id,
      displayName: v.displayName,
      estimatedCostUsd: v.cost,
      usage: v.usage,
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  const overall: CacheEfficiency = dominantModel
    ? cacheEfficiency(dominantModel, overallUsage)
    : EMPTY_CACHE_EFFICIENCY;

  const range: DateRange = options.range ?? {
    from: minDate ?? "1970-01-01",
    to: maxDate ?? "1970-01-01",
  };

  return {
    range,
    totalUsd,
    byModel: models,
    daily: dailyArr,
    byProject: projectArr,
    overallCacheEfficiency: overall,
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function defaultProjectKey(s: SessionUsageSummary): {
  readonly id: string;
  readonly displayName: string;
} {
  const cwd = s.cwd ?? "unknown";
  const parts = cwd.split("/").filter(Boolean);
  return {
    id: cwd,
    displayName: parts.length > 0 ? parts[parts.length - 1]! : cwd,
  };
}

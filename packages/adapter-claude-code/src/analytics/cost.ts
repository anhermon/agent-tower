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

type ModelUsageMutable = Mutable<ModelUsage>;
type DailyBucket = { total: number; models: Record<string, number> };
type ProjectBucket = { displayName: string; cost: number; usage: ModelUsageMutable };

/**
 * Pure cost breakdown fold. Returns per-model, per-day, per-project cost
 * rollups plus an overall cache-efficiency summary. Unknown models use the
 * pricing fallback (upper-bound). No I/O, no clocks.
 */
export function foldCostBreakdown(
  sessions: readonly SessionUsageSummary[],
  options: CostFoldOptions = {}
): CostBreakdown {
  const byModelUsage = new Map<string, ModelUsageMutable>();
  const byModelCost = new Map<string, number>();
  const daily = new Map<string, DailyBucket>();
  const byProject = new Map<string, ProjectBucket>();
  let totalUsd = 0;
  let minDate: string | undefined;
  let maxDate: string | undefined;

  // Overall usage used to compute a blended cache efficiency (weighted by the
  // dominant model's pricing — this matches cc-lens's per-model panel where
  // the overall card uses the dominant model as a reference).
  const overallUsage: ModelUsageMutable = {
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
      accumulateModelUsage(byModelUsage, byModelCost, s.model, s);
    }
    accumulateOverallUsage(overallUsage, s);
    totalUsd += s.estimatedCostUsd;

    if (s.startTime) {
      const date = s.startTime.slice(0, 10);
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
      accumulateDaily(daily, date, s);
    }

    const projectKey = options.projectKey ? options.projectKey(s) : defaultProjectKey(s);
    accumulateProject(byProject, projectKey, s);
  }

  const models = buildModelRows(byModelUsage, byModelCost);
  const dailyArr = buildDailySeries(daily);
  const projectArr = buildProjectRows(byProject);

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

function accumulateModelUsage(
  byModelUsage: Map<string, ModelUsageMutable>,
  byModelCost: Map<string, number>,
  model: string,
  s: SessionUsageSummary
): void {
  const u = byModelUsage.get(model) ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  u.inputTokens += s.usage.inputTokens;
  u.outputTokens += s.usage.outputTokens;
  u.cacheReadInputTokens += s.usage.cacheReadInputTokens;
  u.cacheCreationInputTokens += s.usage.cacheCreationInputTokens;
  byModelUsage.set(model, u);
  byModelCost.set(model, (byModelCost.get(model) ?? 0) + s.estimatedCostUsd);
}

function accumulateOverallUsage(overallUsage: ModelUsageMutable, s: SessionUsageSummary): void {
  overallUsage.inputTokens += s.usage.inputTokens;
  overallUsage.outputTokens += s.usage.outputTokens;
  overallUsage.cacheReadInputTokens += s.usage.cacheReadInputTokens;
  overallUsage.cacheCreationInputTokens += s.usage.cacheCreationInputTokens;
}

function accumulateDaily(
  daily: Map<string, DailyBucket>,
  date: string,
  s: SessionUsageSummary
): void {
  const bucket = daily.get(date) ?? { total: 0, models: {} };
  bucket.total += s.estimatedCostUsd;
  if (s.model) {
    bucket.models[s.model] = (bucket.models[s.model] ?? 0) + s.estimatedCostUsd;
  }
  daily.set(date, bucket);
}

function accumulateProject(
  byProject: Map<string, ProjectBucket>,
  projectKey: { readonly id: string; readonly displayName: string },
  s: SessionUsageSummary
): void {
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

function buildModelRows(
  byModelUsage: Map<string, ModelUsageMutable>,
  byModelCost: Map<string, number>
): ModelCostBreakdown[] {
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
  return models;
}

function buildDailySeries(daily: Map<string, DailyBucket>): DailyCostPoint[] {
  return [...daily.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, totalUsd: v.total, byModel: v.models }));
}

function buildProjectRows(byProject: Map<string, ProjectBucket>): ProjectCostRow[] {
  return [...byProject.entries()]
    .map(([id, v]) => ({
      projectId: id,
      displayName: v.displayName,
      estimatedCostUsd: v.cost,
      usage: v.usage,
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
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

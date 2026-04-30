import "server-only";
import {
  buildFeatureMatrix,
  compareByHarness,
  compareByModel,
  type FeatureMatrix,
  type HarnessMetrics,
  type ModelMetrics,
} from "@control-plane/adapter-claude-code";

import { getConfiguredAnalyticsSource } from "./sessions-source";

/**
 * Server-only source for the Compare module.
 *
 * Wraps the compare analytics folds with the standard Result envelope used
 * across all dashboard modules.
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

export interface CompareData {
  readonly models: readonly ModelMetrics[];
  readonly harnesses: readonly HarnessMetrics[];
  readonly featureMatrix: FeatureMatrix;
  readonly sessionCount: number;
}

export async function getCompareData(): Promise<Result<CompareData>> {
  const source = getConfiguredAnalyticsSource();
  if (!source) return { ok: false, reason: "unconfigured" };
  try {
    const summaries = await source.listSessionSummaries();
    const models = compareByModel(summaries);
    const harnesses = compareByHarness(summaries);
    const featureMatrix = buildFeatureMatrix(summaries);
    return {
      ok: true,
      value: {
        models,
        harnesses,
        featureMatrix,
        sessionCount: summaries.length,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

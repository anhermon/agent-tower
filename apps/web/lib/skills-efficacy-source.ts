import "server-only";

/**
 * Web-facing re-export of the skill efficacy heuristic. The implementation
 * lives in `@control-plane/adapter-claude-code` so the `cp` CLI and MCP server
 * can compute the same delta / outcome breakdown the dashboard shows.
 *
 * `computeSkillsEfficacy` is wrapped in `unstable_cache` (30s TTL) to avoid
 * re-aggregating the full JSONL corpus on every navigation. The cache key
 * includes the serialized params so different filter combinations are cached
 * independently.
 */

import { unstable_cache } from "next/cache";

import { computeSkillsEfficacy as _computeSkillsEfficacy } from "@control-plane/adapter-claude-code";

export type {
  EfficacyBaseline,
  ListSkillsEfficacyResult,
  SessionOutcome,
  SkillEfficacyRow,
  SkillEfficacySessionSummary as SessionSummary,
  SkillsEfficacyReport,
} from "@control-plane/adapter-claude-code";
export { __clearSkillsEfficacyCacheForTests } from "@control-plane/adapter-claude-code";

type EfficacyParams = Parameters<typeof _computeSkillsEfficacy>[0];

const _cachedComputeSkillsEfficacy = unstable_cache(
  async (params: EfficacyParams): ReturnType<typeof _computeSkillsEfficacy> => {
    return await _computeSkillsEfficacy(params);
  },
  ["skills-efficacy"],
  { revalidate: 30, tags: ["skills"] }
);

export async function computeSkillsEfficacy(
  params?: EfficacyParams
): ReturnType<typeof _computeSkillsEfficacy> {
  return await _cachedComputeSkillsEfficacy(params);
}

import "server-only";

/**
 * Web-facing re-export of Skill-tool usage analytics. The implementation lives
 * in `@control-plane/adapter-claude-code` so the `cp` CLI and MCP server share
 * a single source of truth.
 *
 * `computeSkillsUsage` is wrapped in `unstable_cache` (30s TTL) to avoid
 * re-aggregating the full JSONL corpus on every navigation. The cache key
 * includes the serialized params so different filter combinations are cached
 * independently.
 */

import { unstable_cache } from "next/cache";

import { computeSkillsUsage as _computeSkillsUsage } from "@control-plane/adapter-claude-code";

export type {
  ListSkillsUsageResult,
  SkillsUsageReport,
  SkillUsageStats,
} from "@control-plane/adapter-claude-code";
export { __clearSkillsUsageCacheForTests } from "@control-plane/adapter-claude-code";

type UsageParams = Parameters<typeof _computeSkillsUsage>[0];

const _cachedComputeSkillsUsage = unstable_cache(
  async (params: UsageParams): ReturnType<typeof _computeSkillsUsage> => {
    return await _computeSkillsUsage(params);
  },
  ["skills-usage"],
  { revalidate: 30, tags: ["skills"] }
);

export async function computeSkillsUsage(
  params?: UsageParams
): ReturnType<typeof _computeSkillsUsage> {
  return await _cachedComputeSkillsUsage(params);
}

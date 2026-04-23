import "server-only";

/**
 * Web-facing re-export of Skill-tool usage analytics. The implementation lives
 * in `@control-plane/adapter-claude-code` so the `cp` CLI and MCP server share
 * a single source of truth.
 */

export {
  __clearSkillsUsageCacheForTests,
  computeSkillsUsage
} from "@control-plane/adapter-claude-code";
export type {
  ListSkillsUsageResult,
  SkillUsageStats,
  SkillsUsageReport
} from "@control-plane/adapter-claude-code";

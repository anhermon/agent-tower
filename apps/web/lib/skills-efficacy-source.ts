import "server-only";

/**
 * Web-facing re-export of the skill efficacy heuristic. The implementation
 * lives in `@control-plane/adapter-claude-code` so the `cp` CLI and MCP server
 * can compute the same delta / outcome breakdown the dashboard shows.
 */

export type {
  EfficacyBaseline,
  ListSkillsEfficacyResult,
  SessionOutcome,
  SkillEfficacyRow,
  SkillEfficacySessionSummary as SessionSummary,
  SkillsEfficacyReport,
} from "@control-plane/adapter-claude-code";
export {
  __clearSkillsEfficacyCacheForTests,
  computeSkillsEfficacy,
} from "@control-plane/adapter-claude-code";

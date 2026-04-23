import "server-only";

/**
 * Web-facing re-export of the skill-manifest discovery API. The full
 * implementation lives in `@control-plane/adapter-claude-code` so the `cp` CLI
 * and the MCP server can reuse the same logic without importing `apps/web`.
 *
 * Resolution order for the roots to scan:
 *   1. `CONTROL_PLANE_SKILLS_ROOTS` env var (OS path-separator joined list).
 *   2. `~/.claude/skills` if it exists.
 *   3. `[]` → callers render an empty state with configuration guidance.
 */

export {
  SKILLS_ROOTS_ENV,
  SKILL_FILENAME,
  __clearSkillsCacheForTests,
  getConfiguredSkillsRoots,
  listSkillsOrEmpty,
  loadSkillOrUndefined,
  resolveSkillsRoots
} from "@control-plane/adapter-claude-code";
export type {
  ListSkillsResult,
  LoadSkillResult,
  ResolvedSkillsRoot,
  SkillManifest,
  SkillsRootOrigin
} from "@control-plane/adapter-claude-code";

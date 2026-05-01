export * from "./adapter.js";
export { ClaudeCodeHarnessAdapter } from "./harness-adapter.js";
export { CodexHarnessAdapter, CODEX_HOME_ENV, resolveCodexDataRoot } from "./codex-adapter.js";
export { buildAdapterRegistry } from "./registry-factory.js";
export type { CostFoldOptions } from "./analytics/cost.js";
export { foldCostBreakdown } from "./analytics/cost.js";
export type { ProjectGrouping } from "./analytics/project-summary.js";
export {
  foldProjectSummaries,
  foldProjectSummary,
} from "./analytics/project-summary.js";
export type { ReplayFoldOptions } from "./analytics/replay.js";
export { foldReplay } from "./analytics/replay.js";
export type { FoldSessionOptions } from "./analytics/session-summary.js";
// Phase 1 Wave 0: analytics folds + optional enrichment sources.
export { foldSessionSummary } from "./analytics/session-summary.js";
export type {
  SkillAttributionEntry,
  SkillTurnAttribution,
  SkillTurnAttributionFoldOptions,
} from "./analytics/skill-turn-attribution.js";
export { computeSkillTurnAttribution } from "./analytics/skill-turn-attribution.js";
export type { TimeseriesFoldOptions } from "./analytics/timeseries.js";
export { computeStreaks, foldTimeseries } from "./analytics/timeseries.js";
export { foldToolAnalytics } from "./analytics/tools.js";
export type {
  TurnTimeline,
  TurnTimelineEntry,
  TurnTimelineFoldOptions,
} from "./analytics/turn-timeline.js";
export { computeTurnTimeline } from "./analytics/turn-timeline.js";
export { scoreSessionsWaste, scoreSessionWaste } from "./analytics/waste.js";
export type {
  AppliedFixesFile,
  BuildReportOptions,
  DimensionDelta,
  SessionBucket,
  TrackedFix,
  WeightedSessionHealth,
  WeightedWorkflowHealthReport,
  WorkflowHealthDelta,
} from "./analytics/workflow-health.js";
export {
  buildWeightedWorkflowHealthReport,
  getActiveFixesForSession,
  loadAppliedFixes,
} from "./analytics/workflow-health.js";
export type { DataRootOrigin, ResolvedDataRoot } from "./data-root.js";
// Phase 1 Wave 1: data-root resolution + skill catalogue/analytics (shared by
// the web dashboard, the `cp` CLI, and the MCP server).
export {
  CLAUDE_DATA_ROOT_ENV,
  getConfiguredDataRoot,
  resolveDataRoot,
} from "./data-root.js";
export type { ClaudeSessionFacet } from "./facets.js";
export { facetPathForSession, readSessionFacet } from "./facets.js";
export type { NormalizedTranscript, NormalizeOptions } from "./normalizer.js";
export { normalizeTranscript } from "./normalizer.js";
export type {
  ClaudeCodeDataRoot,
  ClaudeSessionFile,
  ReadTranscriptResult,
  TranscriptPreview,
} from "./reader.js";
export {
  listSessionFiles,
  readTranscriptFile,
  readTranscriptPreview,
} from "./reader.js";
export { detectSkillFromBlock, detectSkillsFromEntry } from "./skills/detect.js";
export type {
  EfficacyBaseline,
  ListSkillsEfficacyResult,
  SessionOutcome,
  SessionSummary as SkillEfficacySessionSummary,
  SkillEfficacyRow,
  SkillsEfficacyReport,
} from "./skills/efficacy.js";
export {
  __clearSkillsEfficacyCacheForTests,
  computeSkillsEfficacy,
} from "./skills/efficacy.js";
export type {
  ColdGiantSkill,
  DeadWeightSkill,
  NegativeEfficacySkill,
  SkillsHygieneInput,
  SkillsHygieneReport,
} from "./skills/hygiene.js";
export {
  COLD_GIANT_MAX_INVOCATIONS,
  COLD_GIANT_SIZE_THRESHOLD_BYTES,
  computeSkillsHygiene,
  NEGATIVE_EFFICACY_DELTA_THRESHOLD,
  NEGATIVE_EFFICACY_MIN_SESSIONS,
} from "./skills/hygiene.js";
export type {
  ListSkillsResult,
  LoadSkillResult,
  ResolvedSkillsRoot,
  SkillManifest,
  SkillsRootOrigin,
} from "./skills/manifests.js";

export {
  __clearSkillsCacheForTests,
  getConfiguredSkillsRoots,
  listSkillsOrEmpty,
  loadSkillOrUndefined,
  resolveSkillsRoots,
  SKILL_FILENAME,
  SKILLS_ROOTS_ENV,
} from "./skills/manifests.js";
export type {
  ListSkillsUsageResult,
  SkillsUsageReport,
  SkillUsageStats,
} from "./skills/usage.js";

export {
  __clearSkillsUsageCacheForTests,
  computeSkillsUsage,
} from "./skills/usage.js";
export type { ClaudeStatsCache } from "./stats-cache.js";
export { readStatsCache, statsCachePath } from "./stats-cache.js";
export type {
  ClaudeAssistantEntry,
  ClaudeAttachmentEntry,
  ClaudeContentBlock,
  ClaudeMessagePayload,
  ClaudeMessageUsage,
  ClaudeSummaryEntry,
  ClaudeSystemEntry,
  ClaudeTranscriptEntry,
  ClaudeUnknownEntry,
  ClaudeUserEntry,
} from "./types.js";

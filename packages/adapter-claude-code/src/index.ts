export * from "./adapter.js";
export { listSessionFiles, readTranscriptFile, readTranscriptPreview } from "./reader.js";
export type {
  ClaudeCodeDataRoot,
  ClaudeSessionFile,
  ReadTranscriptResult,
  TranscriptPreview
} from "./reader.js";
export { normalizeTranscript } from "./normalizer.js";
export type { NormalizedTranscript, NormalizeOptions } from "./normalizer.js";
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
  ClaudeUserEntry
} from "./types.js";

// Phase 1 Wave 0: analytics folds + optional enrichment sources.
export { foldSessionSummary } from "./analytics/session-summary.js";
export type { FoldSessionOptions } from "./analytics/session-summary.js";
export {
  foldProjectSummaries,
  foldProjectSummary
} from "./analytics/project-summary.js";
export type { ProjectGrouping } from "./analytics/project-summary.js";
export { computeStreaks, foldTimeseries } from "./analytics/timeseries.js";
export type { TimeseriesFoldOptions } from "./analytics/timeseries.js";
export { foldCostBreakdown } from "./analytics/cost.js";
export type { CostFoldOptions } from "./analytics/cost.js";
export { foldToolAnalytics } from "./analytics/tools.js";
export { foldReplay } from "./analytics/replay.js";
export type { ReplayFoldOptions } from "./analytics/replay.js";
export { readStatsCache, statsCachePath } from "./stats-cache.js";
export type { ClaudeStatsCache } from "./stats-cache.js";
export { facetPathForSession, readSessionFacet } from "./facets.js";
export type { ClaudeSessionFacet } from "./facets.js";

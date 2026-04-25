import "server-only";

/**
 * Server-only data layer for the Replay module.
 *
 * Thin re-export of the shared session/analytics source helpers so the replay
 * pages don't import from sessions-source/sessions-analytics directly.
 */

export {
  CLAUDE_DATA_ROOT_ENV,
  getConfiguredDataRoot,
  listSessionsOrEmpty,
  type ListSessionsResult,
  type SessionListing,
} from "./sessions-source";

export { loadReplay as getReplayData } from "./sessions-analytics";
export type { Result as ReplayResult } from "./sessions-analytics";

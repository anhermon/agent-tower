import "server-only";

/**
 * In-memory store for webhook-triggered Claude Code Action sessions.
 *
 * When GitHub sends a `workflow_run` event for a `claude.yml` run, it is
 * mapped to a WebhookTriggeredSession and appended here.  The store is
 * capped at MAX_SESSIONS entries — oldest entries are dropped first.
 *
 * This is intentionally zero-dependency (no Redis, no BullMQ).  Persistence
 * across restarts is out of scope for Phase 2.
 */

export type WorkflowRunStatus = "queued" | "in_progress" | "completed";
export type WorkflowRunConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | null;

export interface WebhookTriggeredSession {
  /** Stringified workflow_run.id from GitHub */
  readonly id: string;
  readonly repositoryFullName: string;
  readonly workflowName: string;
  readonly status: WorkflowRunStatus;
  readonly conclusion: WorkflowRunConclusion;
  /** GitHub login of the actor who triggered the run */
  readonly triggeredBy: string;
  readonly headBranch: string;
  readonly headCommitMessage: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  /** Direct link to the Actions run page */
  readonly logsUrl: string;
  readonly prNumbers: readonly number[];
  /** ISO timestamp when Agent Tower first received this event */
  readonly receivedAt: string;
}

const MAX_SESSIONS = 500;

/** Module-level singleton — lives for the lifetime of the Next.js server process. */
let sessions: WebhookTriggeredSession[] = [];

/**
 * Append a session record.  If the store is at capacity, the oldest entry is
 * dropped.  If a record with the same id already exists it is replaced in-place
 * so that `workflow_run completed` events update the earlier `queued` entry.
 */
export function appendWebhookSession(session: WebhookTriggeredSession): void {
  const existing = sessions.findIndex((s) => s.id === session.id);
  if (existing !== -1) {
    sessions[existing] = session;
    return;
  }
  if (sessions.length >= MAX_SESSIONS) {
    sessions = sessions.slice(sessions.length - MAX_SESSIONS + 1);
  }
  sessions.push(session);
}

/** Return sessions newest-first, optionally limited. */
export function listWebhookSessions(limit = 100): readonly WebhookTriggeredSession[] {
  return sessions.slice().reverse().slice(0, limit);
}

/** Exposed for tests only — resets store state between test cases. */
export function _resetWebhookSessionStore(): void {
  sessions = [];
}

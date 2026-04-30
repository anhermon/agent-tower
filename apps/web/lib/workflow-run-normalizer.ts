import type {
  WebhookTriggeredSession,
  WorkflowRunConclusion,
  WorkflowRunStatus,
} from "./webhook-session-store";

/**
 * Converts a raw GitHub `workflow_run` webhook payload into a
 * WebhookTriggeredSession record suitable for the in-memory session store.
 *
 * Returns null when the payload is malformed or missing required fields so
 * callers can skip ingestion without throwing.
 */
export function normalizeWorkflowRunPayload(
  rawPayload: unknown,
  receivedAt = new Date().toISOString()
): WebhookTriggeredSession | null {
  if (!isObject(rawPayload)) return null;

  const run = rawPayload.workflow_run;
  if (!isObject(run)) return null;

  const id = extractId(run);
  if (!id) return null;

  return {
    id,
    repositoryFullName: extractRepoFullName(run),
    workflowName: typeof run.name === "string" ? run.name : "claude",
    status: toStatus(run.status),
    conclusion: toConclusion(run.conclusion),
    triggeredBy: extractLogin(run),
    headBranch: typeof run.head_branch === "string" ? run.head_branch : "",
    headCommitMessage: extractCommitMessage(run),
    startedAt:
      typeof run.run_started_at === "string" ? run.run_started_at : new Date().toISOString(),
    completedAt:
      typeof run.updated_at === "string" && run.conclusion !== null ? run.updated_at : null,
    logsUrl: typeof run.html_url === "string" ? run.html_url : "",
    prNumbers: extractPrNumbers(run),
    receivedAt,
  };
}

function extractId(run: Record<string, unknown>): string | null {
  const raw = run.id;
  if (typeof raw === "number" || typeof raw === "string") return String(raw) || null;
  return null;
}

function extractRepoFullName(run: Record<string, unknown>): string {
  if (isObject(run.repository) && typeof run.repository.full_name === "string") {
    return run.repository.full_name;
  }
  return "unknown/unknown";
}

function extractLogin(run: Record<string, unknown>): string {
  if (isObject(run.actor) && typeof run.actor.login === "string") {
    return run.actor.login;
  }
  return "unknown";
}

function extractCommitMessage(run: Record<string, unknown>): string {
  if (isObject(run.head_commit) && typeof run.head_commit.message === "string") {
    return run.head_commit.message;
  }
  return "";
}

function extractPrNumbers(run: Record<string, unknown>): number[] {
  const prNumbers: number[] = [];
  if (!Array.isArray(run.pull_requests)) return prNumbers;
  for (const pr of run.pull_requests) {
    if (isObject(pr) && typeof pr.number === "number") {
      prNumbers.push(pr.number);
    }
  }
  return prNumbers;
}

function toStatus(value: unknown): WorkflowRunStatus {
  if (value === "queued" || value === "in_progress" || value === "completed") {
    return value;
  }
  return "queued";
}

function toConclusion(value: unknown): WorkflowRunConclusion {
  const valid = [
    "success",
    "failure",
    "neutral",
    "cancelled",
    "skipped",
    "timed_out",
    "action_required",
  ];
  if (typeof value === "string" && valid.includes(value)) {
    return value as WorkflowRunConclusion;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

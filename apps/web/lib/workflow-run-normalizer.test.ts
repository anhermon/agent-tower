import { describe, expect, it } from "vitest";

import { normalizeWorkflowRunPayload } from "./workflow-run-normalizer";

const BASE_RUN = {
  id: 9876543210,
  name: "claude",
  status: "completed",
  conclusion: "success",
  html_url: "https://github.com/owner/repo/actions/runs/9876543210",
  head_branch: "feat/some-branch",
  run_started_at: "2026-04-26T09:00:00Z",
  updated_at: "2026-04-26T09:05:00Z",
  actor: { login: "octocat" },
  repository: { full_name: "owner/repo" },
  head_commit: { message: "fix: resolve issue #42" },
  pull_requests: [{ number: 42 }],
};

const PAYLOAD = { workflow_run: BASE_RUN };

describe("normalizeWorkflowRunPayload", () => {
  it("maps a complete workflow_run payload to a WebhookTriggeredSession", () => {
    const session = normalizeWorkflowRunPayload(PAYLOAD, "2026-04-26T09:05:01Z");
    expect(session).not.toBeNull();
    if (!session) return;

    expect(session.id).toBe("9876543210");
    expect(session.repositoryFullName).toBe("owner/repo");
    expect(session.workflowName).toBe("claude");
    expect(session.status).toBe("completed");
    expect(session.conclusion).toBe("success");
    expect(session.triggeredBy).toBe("octocat");
    expect(session.headBranch).toBe("feat/some-branch");
    expect(session.headCommitMessage).toBe("fix: resolve issue #42");
    expect(session.startedAt).toBe("2026-04-26T09:00:00Z");
    expect(session.completedAt).toBe("2026-04-26T09:05:00Z");
    expect(session.logsUrl).toBe("https://github.com/owner/repo/actions/runs/9876543210");
    expect(session.prNumbers).toEqual([42]);
    expect(session.receivedAt).toBe("2026-04-26T09:05:01Z");
  });

  it("returns null for null input", () => {
    expect(normalizeWorkflowRunPayload(null)).toBeNull();
  });

  it("returns null when workflow_run is absent", () => {
    expect(normalizeWorkflowRunPayload({ action: "completed" })).toBeNull();
  });

  it("returns null when workflow_run.id is absent", () => {
    const payload = { workflow_run: { name: "claude" } };
    expect(normalizeWorkflowRunPayload(payload)).toBeNull();
  });

  it("handles unknown status by defaulting to queued", () => {
    const payload = { workflow_run: { ...BASE_RUN, status: "waiting", conclusion: null } };
    const session = normalizeWorkflowRunPayload(payload);
    expect(session?.status).toBe("queued");
  });

  it("handles null conclusion (run still in progress)", () => {
    const payload = {
      workflow_run: { ...BASE_RUN, status: "in_progress", conclusion: null, updated_at: null },
    };
    const session = normalizeWorkflowRunPayload(payload);
    expect(session?.status).toBe("in_progress");
    expect(session?.conclusion).toBeNull();
    expect(session?.completedAt).toBeNull();
  });

  it("collects PR numbers from pull_requests array", () => {
    const payload = {
      workflow_run: { ...BASE_RUN, pull_requests: [{ number: 7 }, { number: 99 }] },
    };
    const session = normalizeWorkflowRunPayload(payload);
    expect(session?.prNumbers).toEqual([7, 99]);
  });

  it("handles empty pull_requests array", () => {
    const payload = { workflow_run: { ...BASE_RUN, pull_requests: [] } };
    const session = normalizeWorkflowRunPayload(payload);
    expect(session?.prNumbers).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { GitHubActionExecutor } from "./github-actions";
import { processWorkflowJob, buildTemplateContext } from "./workflow-worker";
import type { WorkflowJobData } from "./workflow-queue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(data: WorkflowJobData): Job<WorkflowJobData> {
  return {
    id: "job-1",
    data,
  } as unknown as Job<WorkflowJobData>;
}

function makeJobData(overrides: Partial<WorkflowJobData> = {}): WorkflowJobData {
  return {
    webhookEventId: "evt-1",
    webhookEventType: "pull_request",
    webhookAction: "opened",
    repositoryFullName: "owner/repo",
    senderLogin: "alice",
    rawPayload: { number: 42 },
    ruleName: "Test Rule",
    actions: [],
    repoConfig: { version: 1, enabled: true, rules: [] },
    ...overrides,
  };
}

function makeExecutor(): {
  [K in keyof GitHubActionExecutor]: ReturnType<typeof vi.fn>;
} & GitHubActionExecutor {
  return {
    reviewPullRequest: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(undefined),
    createIssue: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// buildTemplateContext
// ---------------------------------------------------------------------------

describe("buildTemplateContext", () => {
  it("exposes payload and event fields", () => {
    const data = makeJobData({ rawPayload: { number: 99 } });
    const ctx = buildTemplateContext(data);
    expect(ctx.payload).toEqual({ number: 99 });
    expect((ctx.event as Record<string, unknown>).eventType).toBe("pull_request");
    expect((ctx.event as Record<string, unknown>).action).toBe("opened");
    expect((ctx.event as Record<string, unknown>).repositoryFullName).toBe("owner/repo");
    expect((ctx.event as Record<string, unknown>).senderLogin).toBe("alice");
  });
});

// ---------------------------------------------------------------------------
// processWorkflowJob — review_pr
// ---------------------------------------------------------------------------

describe("processWorkflowJob — review_pr", () => {
  let executor: ReturnType<typeof makeExecutor>;

  beforeEach(() => {
    executor = makeExecutor();
  });

  it("calls reviewPullRequest with PR number from payload.number", async () => {
    const data = makeJobData({
      rawPayload: { number: 7 },
      actions: [{ type: "review_pr", instructions: "Please review." }],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.reviewPullRequest).toHaveBeenCalledOnce();
    expect(executor.reviewPullRequest).toHaveBeenCalledWith({
      repoFullName: "owner/repo",
      pullRequestNumber: 7,
      instructions: "Please review.",
    });
  });

  it("calls reviewPullRequest with PR number from payload.pull_request.number", async () => {
    const data = makeJobData({
      rawPayload: { pull_request: { number: 12 } },
      actions: [{ type: "review_pr" }],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.reviewPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ pullRequestNumber: 12 })
    );
  });

  it("renders template in instructions", async () => {
    const data = makeJobData({
      rawPayload: { number: 3 },
      actions: [{ type: "review_pr", instructions: "PR opened by {{event.senderLogin}}" }],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.reviewPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: "PR opened by alice" })
    );
  });

  it("uses empty string for instructions when omitted", async () => {
    const data = makeJobData({
      rawPayload: { number: 5 },
      actions: [{ type: "review_pr" }],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.reviewPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: "" })
    );
  });

  it("throws when PR number cannot be extracted", async () => {
    const data = makeJobData({
      rawPayload: { title: "no number here" },
      actions: [{ type: "review_pr" }],
    });

    await expect(processWorkflowJob(makeJob(data), executor)).rejects.toThrow(
      "Cannot extract pull request number from payload"
    );
  });
});

// ---------------------------------------------------------------------------
// processWorkflowJob — respond_comment
// ---------------------------------------------------------------------------

describe("processWorkflowJob — respond_comment", () => {
  let executor: ReturnType<typeof makeExecutor>;

  beforeEach(() => {
    executor = makeExecutor();
  });

  it("calls createComment with issue number from payload.number", async () => {
    const data = makeJobData({
      rawPayload: { number: 99 },
      actions: [{ type: "respond_comment", instructions: "Hello from bot." }],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.createComment).toHaveBeenCalledOnce();
    expect(executor.createComment).toHaveBeenCalledWith({
      repoFullName: "owner/repo",
      issueNumber: 99,
      body: "Hello from bot.",
    });
  });

  it("calls createComment with issue number from payload.issue.number", async () => {
    const data = makeJobData({
      rawPayload: { issue: { number: 55 } },
      actions: [{ type: "respond_comment" }],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issueNumber: 55, body: "" })
    );
  });

  it("throws when issue number cannot be extracted", async () => {
    const data = makeJobData({
      rawPayload: { title: "no number" },
      actions: [{ type: "respond_comment" }],
    });

    await expect(processWorkflowJob(makeJob(data), executor)).rejects.toThrow(
      "Cannot extract issue number from payload"
    );
  });
});

// ---------------------------------------------------------------------------
// processWorkflowJob — create_issue
// ---------------------------------------------------------------------------

describe("processWorkflowJob — create_issue", () => {
  let executor: ReturnType<typeof makeExecutor>;

  beforeEach(() => {
    executor = makeExecutor();
  });

  it("calls createIssue with rendered title and body", async () => {
    const data = makeJobData({
      webhookEventType: "check_run",
      actions: [
        {
          type: "create_issue",
          title_template: "CI failed on {{event.repositoryFullName}}",
          body_template: "Triggered by {{event.eventType}}",
        },
      ],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.createIssue).toHaveBeenCalledWith({
      repoFullName: "owner/repo",
      title: "CI failed on owner/repo",
      body: "Triggered by check_run",
    });
  });

  it("uses default title when title_template is omitted", async () => {
    const data = makeJobData({
      actions: [{ type: "create_issue" }],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Workflow triggered issue", body: "" })
    );
  });
});

// ---------------------------------------------------------------------------
// processWorkflowJob — multiple actions
// ---------------------------------------------------------------------------

describe("processWorkflowJob — multiple actions", () => {
  it("processes all actions in sequence", async () => {
    const executor = makeExecutor();
    const data = makeJobData({
      rawPayload: { number: 1 },
      actions: [
        { type: "review_pr", instructions: "First" },
        { type: "respond_comment", instructions: "Second" },
      ],
    });

    await processWorkflowJob(makeJob(data), executor);

    expect(executor.reviewPullRequest).toHaveBeenCalledOnce();
    expect(executor.createComment).toHaveBeenCalledOnce();
  });

  it("stops processing and re-throws when an action fails", async () => {
    const executor = makeExecutor();
    executor.reviewPullRequest.mockRejectedValueOnce(new Error("API down"));

    const data = makeJobData({
      rawPayload: { number: 1 },
      actions: [{ type: "review_pr" }, { type: "respond_comment" }],
    });

    await expect(processWorkflowJob(makeJob(data), executor)).rejects.toThrow("API down");
    expect(executor.createComment).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processWorkflowJob — unknown action type
// ---------------------------------------------------------------------------

describe("processWorkflowJob — unknown action type", () => {
  it("does not throw for an unknown action type", async () => {
    const executor = makeExecutor();
    const data = makeJobData({
      actions: [{ type: "teleport_to_mars" }],
    });

    await expect(processWorkflowJob(makeJob(data), executor)).resolves.toBeUndefined();
  });
});

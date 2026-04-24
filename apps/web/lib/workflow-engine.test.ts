import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryEventBus,
  InMemoryAppendOnlyEventLog,
  type EventEnvelope,
} from "@control-plane/events";
import type { RepoConfigProvider, RepoWorkflowConfig } from "./repo-config";
import { createWorkflowEngine, type WebhookReceived, type WorkflowJob } from "./workflow-engine";

function createWebhookEvent(overrides: Partial<WebhookReceived["payload"]> = {}): WebhookReceived {
  return {
    id: "evt-1",
    type: "webhook.received",
    version: 1,
    occurredAt: new Date().toISOString(),
    source: {
      kind: "webhook",
      id: "delivery-1",
    },
    payload: {
      eventType: "pull_request",
      action: "opened",
      repositoryFullName: "owner/repo",
      senderLogin: "user1",
      rawPayload: {},
      ...overrides,
    },
  };
}

describe("WorkflowEngine", () => {
  let eventBus: InMemoryEventBus<EventEnvelope>;
  let jobQueue: InMemoryAppendOnlyEventLog<WorkflowJob>;
  let repoConfigProvider: RepoConfigProvider;
  let engine: ReturnType<typeof createWorkflowEngine>;

  beforeEach(() => {
    eventBus = new InMemoryEventBus<EventEnvelope>();
    jobQueue = new InMemoryAppendOnlyEventLog<WorkflowJob>();
    repoConfigProvider = {
      fetchConfig: vi.fn(),
    };
    engine = createWorkflowEngine({
      eventBus,
      jobQueue,
      repoConfigProvider,
    });
  });

  afterEach(() => {
    engine.stop();
    eventBus.clear();
    jobQueue.clear();
  });

  it("given WebhookReceived event, fetches config, matches rule, creates job", async () => {
    const config: RepoWorkflowConfig = {
      version: 1,
      enabled: true,
      rules: [
        {
          name: "Review PRs",
          events: [{ type: "pull_request", actions: ["opened"] }],
          actions: [{ type: "review_pr", instructions: "Review this PR" }],
        },
      ],
    };

    vi.mocked(repoConfigProvider.fetchConfig).mockResolvedValue(config);

    const event = createWebhookEvent({
      eventType: "pull_request",
      action: "opened",
      repositoryFullName: "owner/repo",
    });

    await eventBus.publish(event);

    const jobs = await jobQueue.read();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].event.payload.ruleName).toBe("Review PRs");
    expect(jobs[0].event.payload.repoFullName).toBe("owner/repo");
    expect(jobs[0].event.payload.status).toBe("pending");
    expect(jobs[0].event.payload.actions).toHaveLength(1);
    expect(jobs[0].event.payload.actions[0].type).toBe("review_pr");
  });

  it("given no config, drops event", async () => {
    vi.mocked(repoConfigProvider.fetchConfig).mockResolvedValue(null);

    const event = createWebhookEvent({
      repositoryFullName: "owner/repo",
    });

    await eventBus.publish(event);

    const jobs = await jobQueue.read();
    expect(jobs).toHaveLength(0);
  });

  it("given disabled config, drops event", async () => {
    const config: RepoWorkflowConfig = {
      version: 1,
      enabled: false,
      rules: [
        {
          name: "Review PRs",
          events: [{ type: "pull_request" }],
          actions: [{ type: "review_pr" }],
        },
      ],
    };

    vi.mocked(repoConfigProvider.fetchConfig).mockResolvedValue(config);

    const event = createWebhookEvent({
      repositoryFullName: "owner/repo",
    });

    await eventBus.publish(event);

    const jobs = await jobQueue.read();
    expect(jobs).toHaveLength(0);
  });

  it("given non-matching event type, no job created", async () => {
    const config: RepoWorkflowConfig = {
      version: 1,
      enabled: true,
      rules: [
        {
          name: "Review PRs",
          events: [{ type: "pull_request" }],
          actions: [{ type: "review_pr" }],
        },
      ],
    };

    vi.mocked(repoConfigProvider.fetchConfig).mockResolvedValue(config);

    const event = createWebhookEvent({
      eventType: "issues",
      action: "opened",
      repositoryFullName: "owner/repo",
    });

    await eventBus.publish(event);

    const jobs = await jobQueue.read();
    expect(jobs).toHaveLength(0);
  });

  it("given matching filter expression, job created", async () => {
    const config: RepoWorkflowConfig = {
      version: 1,
      enabled: true,
      rules: [
        {
          name: "CI Failures",
          events: [
            {
              type: "check_run",
              actions: ["completed"],
              filter: "payload.conclusion == 'failure'",
            },
          ],
          actions: [{ type: "create_issue" }],
        },
      ],
    };

    vi.mocked(repoConfigProvider.fetchConfig).mockResolvedValue(config);

    const event = createWebhookEvent({
      eventType: "check_run",
      action: "completed",
      repositoryFullName: "owner/repo",
      rawPayload: { conclusion: "failure" },
    });

    await eventBus.publish(event);

    const jobs = await jobQueue.read();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].event.payload.ruleName).toBe("CI Failures");
  });

  it("given non-matching filter expression, no job created", async () => {
    const config: RepoWorkflowConfig = {
      version: 1,
      enabled: true,
      rules: [
        {
          name: "CI Failures",
          events: [
            {
              type: "check_run",
              actions: ["completed"],
              filter: "payload.conclusion == 'failure'",
            },
          ],
          actions: [{ type: "create_issue" }],
        },
      ],
    };

    vi.mocked(repoConfigProvider.fetchConfig).mockResolvedValue(config);

    const event = createWebhookEvent({
      eventType: "check_run",
      action: "completed",
      repositoryFullName: "owner/repo",
      rawPayload: { conclusion: "success" },
    });

    await eventBus.publish(event);

    const jobs = await jobQueue.read();
    expect(jobs).toHaveLength(0);
  });
});

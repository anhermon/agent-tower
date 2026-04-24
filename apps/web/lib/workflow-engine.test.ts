/* eslint-disable @typescript-eslint/unbound-method -- Vitest expect(mock).toHaveBeenCalledWith patterns are safely bound by the test framework */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryEventBus, type EventEnvelope, EventSourceKind } from "@control-plane/events";

import { createWorkflowEngine, type WebhookReceived } from "./workflow-engine";

import type { RepoConfigProvider, RepoWorkflowConfig } from "./repo-config";

function createWebhookEvent(overrides: Partial<WebhookReceived["payload"]> = {}): WebhookReceived {
  return {
    id: "evt-1",
    type: "webhook.received",
    version: 1,
    occurredAt: new Date().toISOString(),
    source: {
      kind: EventSourceKind.Webhook,
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
  let jobQueue: { add: ReturnType<typeof vi.fn>; getJobs: ReturnType<typeof vi.fn> };
  let repoConfigProvider: RepoConfigProvider;
  let engine: ReturnType<typeof createWorkflowEngine>;

  beforeEach(() => {
    eventBus = new InMemoryEventBus<EventEnvelope>();
    jobQueue = {
      add: vi.fn().mockResolvedValue(undefined),
      getJobs: vi.fn().mockResolvedValue([]),
    };
    repoConfigProvider = {
      fetchConfig: vi.fn(),
    };
    engine = createWorkflowEngine({
      eventBus,
      jobQueue: jobQueue as unknown as Parameters<typeof createWorkflowEngine>[0]["jobQueue"],
      repoConfigProvider,
    });
  });

  afterEach(() => {
    engine.stop();
    eventBus.clear();
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

    expect(jobQueue.add).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- accessing mock call data; typed as any by Vitest
    const jobData = jobQueue.add.mock.calls[0][1];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing mock call data
    expect(jobData.ruleName).toBe("Review PRs");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing mock call data
    expect(jobData.repositoryFullName).toBe("owner/repo");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing mock call data
    expect(jobData.actions).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing mock call data
    expect(jobData.actions[0].type).toBe("review_pr");
  });

  it("given no config, drops event", async () => {
    vi.mocked(repoConfigProvider.fetchConfig).mockResolvedValue(null);

    const event = createWebhookEvent({
      repositoryFullName: "owner/repo",
    });

    await eventBus.publish(event);

    expect(jobQueue.add).not.toHaveBeenCalled();
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

    expect(jobQueue.add).not.toHaveBeenCalled();
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

    expect(jobQueue.add).not.toHaveBeenCalled();
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

    expect(jobQueue.add).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- accessing mock call data; typed as any by Vitest
    const jobData = jobQueue.add.mock.calls[0][1];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing mock call data
    expect(jobData.ruleName).toBe("CI Failures");
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

    expect(jobQueue.add).not.toHaveBeenCalled();
  });
});

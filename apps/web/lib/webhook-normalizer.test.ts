import { describe, expect, it } from "vitest";

import { normalizeGithubWebhook } from "./webhook-normalizer";

describe("normalizeGithubWebhook", () => {
  it("given pull_request opened payload, returns canonical WebhookReceived", () => {
    const payload = {
      action: "opened",
      number: 42,
      pull_request: { id: 1, number: 42 },
      repository: { full_name: "owner/repo" },
      sender: { login: "testuser" },
    };

    const result = normalizeGithubWebhook({
      headers: { "x-github-delivery": "del-123", "x-github-event": "pull_request" },
      body: payload,
    });

    expect(result.type).toBe("webhook.received");
    expect(result.source.provider).toBe("github");
    expect(result.source.id).toBe("del-123");
    expect(result.payload.eventType).toBe("pull_request");
    expect(result.payload.action).toBe("opened");
    expect(result.payload.repositoryFullName).toBe("owner/repo");
    expect(result.payload.senderLogin).toBe("testuser");
    expect(result.payload.rawPayload).toBe(payload);
  });
});

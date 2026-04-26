import { afterEach, describe, expect, it } from "vitest";

import {
  type WebhookTriggeredSession,
  _resetWebhookSessionStore,
  appendWebhookSession,
  listWebhookSessions,
} from "./webhook-session-store";

function makeSession(
  id: string,
  overrides: Partial<WebhookTriggeredSession> = {}
): WebhookTriggeredSession {
  return {
    id,
    repositoryFullName: "owner/repo",
    workflowName: "claude",
    status: "completed",
    conclusion: "success",
    triggeredBy: "octocat",
    headBranch: "main",
    headCommitMessage: "fix: something",
    startedAt: "2026-04-26T09:00:00Z",
    completedAt: "2026-04-26T09:01:00Z",
    logsUrl: `https://github.com/owner/repo/actions/runs/${id}`,
    prNumbers: [],
    receivedAt: "2026-04-26T09:01:05Z",
    ...overrides,
  };
}

describe("webhook-session-store", () => {
  afterEach(() => {
    _resetWebhookSessionStore();
  });

  it("appends a session and returns it", () => {
    appendWebhookSession(makeSession("1"));
    const list = listWebhookSessions();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("1");
  });

  it("returns sessions newest-first", () => {
    appendWebhookSession(makeSession("1", { startedAt: "2026-04-26T09:00:00Z" }));
    appendWebhookSession(makeSession("2", { startedAt: "2026-04-26T10:00:00Z" }));
    appendWebhookSession(makeSession("3", { startedAt: "2026-04-26T11:00:00Z" }));
    const list = listWebhookSessions();
    expect(list.map((s) => s.id)).toEqual(["3", "2", "1"]);
  });

  it("replaces existing session with the same id (upsert)", () => {
    appendWebhookSession(makeSession("42", { status: "in_progress", conclusion: null }));
    appendWebhookSession(makeSession("42", { status: "completed", conclusion: "success" }));
    const list = listWebhookSessions();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("completed");
    expect(list[0].conclusion).toBe("success");
  });

  it("honours the limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      appendWebhookSession(makeSession(String(i)));
    }
    expect(listWebhookSessions(3)).toHaveLength(3);
  });

  it("drops oldest entries when store exceeds MAX_SESSIONS (verified via 501 entries)", () => {
    // This test exercises the eviction path by filling the store to 501.
    // Importing MAX_SESSIONS would tightly couple the test to the impl, so
    // we just verify the cap is finite and older entries are dropped first.
    for (let i = 0; i < 501; i++) {
      appendWebhookSession(makeSession(String(i)));
    }
    const list = listWebhookSessions(1000);
    expect(list.length).toBeLessThanOrEqual(500);
    // The very first entry (id "0") must have been evicted.
    expect(list.find((s) => s.id === "0")).toBeUndefined();
  });
});

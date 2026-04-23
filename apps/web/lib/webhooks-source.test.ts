import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { WEBHOOK_EVENT_TYPES } from "@control-plane/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GITHUB_WEBHOOK_DELIVERIES_FILE_ENV } from "./github-webhooks";
import {
  __clearWebhooksCacheForTests,
  getConfiguredWebhooksFile,
  listWebhooksOrEmpty,
  loadWebhookOrUndefined,
  WEBHOOKS_FILE_ENV,
} from "./webhooks-source";

/**
 * The sample subscription shapes in this file live here rather than in
 * `apps/web/lib` or `packages/testing` on purpose — shipped source must
 * never carry fabricated webhook data.
 */

const SAMPLE_SUBSCRIPTIONS = [
  {
    id: "sub-session",
    displayName: "Session updates",
    url: "https://hooks.example.test/session",
    eventTypes: [WEBHOOK_EVENT_TYPES.SessionChanged, WEBHOOK_EVENT_TYPES.SessionTurnCreated],
    enabled: true,
    secretRef: "env:SESSION_WEBHOOK_SECRET",
    createdAt: "2026-04-20T10:00:00.000Z",
  },
  {
    id: "sub-cost",
    url: "https://hooks.example.test/cost",
    eventTypes: [WEBHOOK_EVENT_TYPES.CostRecorded],
    enabled: false,
    createdAt: "2026-04-21T10:00:00.000Z",
  },
];

describe("webhooks-source", () => {
  const originalEnv = process.env[WEBHOOKS_FILE_ENV];
  const originalDeliveriesEnv = process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV];
  const tempDirs: string[] = [];

  beforeEach(() => {
    delete process.env[WEBHOOKS_FILE_ENV];
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = missingDeliveriesFilePath();
    __clearWebhooksCacheForTests();
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env[WEBHOOKS_FILE_ENV];
    } else {
      process.env[WEBHOOKS_FILE_ENV] = originalEnv;
    }
    if (originalDeliveriesEnv === undefined) {
      delete process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV];
    } else {
      process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = originalDeliveriesEnv;
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
    __clearWebhooksCacheForTests();
  });

  it("given_no_env_var__when_listing__then_returns_unconfigured_result", async () => {
    expect(getConfiguredWebhooksFile()).toBeNull();

    const result = await listWebhooksOrEmpty();
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("given_env_var_with_whitespace__when_listing__then_returns_unconfigured_result", async () => {
    process.env[WEBHOOKS_FILE_ENV] = "   ";
    expect(getConfiguredWebhooksFile()).toBeNull();

    const result = await listWebhooksOrEmpty();
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("given_env_var_pointing_at_missing_file__when_listing__then_returns_error_result", async () => {
    const missing = path.join(os.tmpdir(), `control-plane-webhooks-missing-${Date.now()}.json`);
    process.env[WEBHOOKS_FILE_ENV] = missing;

    const result = await listWebhooksOrEmpty();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(result.message).toMatch(/ENOENT|no such file/i);
  });

  it("given_env_var_pointing_at_malformed_json__when_listing__then_returns_error_result", async () => {
    const file = await writeFixture("not valid json", "malformed");
    process.env[WEBHOOKS_FILE_ENV] = file;

    const result = await listWebhooksOrEmpty();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(result.message).toMatch(/Failed to parse/);
  });

  it("given_env_var_pointing_at_non_array_json__when_listing__then_returns_error_result", async () => {
    const file = await writeFixture(JSON.stringify({ subscriptions: [] }), "non-array");
    process.env[WEBHOOKS_FILE_ENV] = file;

    const result = await listWebhooksOrEmpty();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(result.message).toMatch(/must contain a JSON array/);
  });

  it("given_env_var_pointing_at_unknown_event_type__when_listing__then_returns_error_result", async () => {
    const invalid = [
      {
        id: "sub-bad",
        url: "https://hooks.example.test/x",
        eventTypes: ["not.a.real.event"],
        enabled: true,
        createdAt: "2026-04-23T10:00:00.000Z",
      },
    ];
    const file = await writeFixture(JSON.stringify(invalid), "invalid-event");
    process.env[WEBHOOKS_FILE_ENV] = file;

    const result = await listWebhooksOrEmpty();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(result.message).toMatch(/unknown event type/);
  });

  it("given_env_var_pointing_at_valid_subscriptions__when_listing__then_returns_them_parsed", async () => {
    const file = await writeFixture(JSON.stringify(SAMPLE_SUBSCRIPTIONS), "valid");
    process.env[WEBHOOKS_FILE_ENV] = file;

    const result = await listWebhooksOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.sourceFile).toBe(file);
    expect(result.snapshot.subscriptions).toHaveLength(2);

    const bySession = result.snapshot.subscriptions.find(
      (listing) => listing.subscription.id === "sub-session"
    );
    expect(bySession).toBeDefined();
    expect(bySession!.subscription.displayName).toBe("Session updates");
    expect(bySession!.subscription.url).toBe("https://hooks.example.test/session");
    expect(bySession!.subscription.enabled).toBe(true);
    expect(bySession!.subscription.secretRef).toBe("env:SESSION_WEBHOOK_SECRET");
    expect(bySession!.subscription.eventTypes).toEqual([
      WEBHOOK_EVENT_TYPES.SessionChanged,
      WEBHOOK_EVENT_TYPES.SessionTurnCreated,
    ]);
    expect(bySession!.deliveryCount).toBe(0);
    expect(bySession!.lastDeliveryAt).toBeNull();

    const byCost = result.snapshot.subscriptions.find(
      (listing) => listing.subscription.id === "sub-cost"
    );
    expect(byCost).toBeDefined();
    expect(byCost!.subscription.displayName).toBeUndefined();
    expect(byCost!.subscription.secretRef).toBeUndefined();
    expect(byCost!.subscription.enabled).toBe(false);

    // No delivery log is configured for this scenario, so the source keeps
    // the delivery collection empty rather than fabricating rows.
    expect(result.snapshot.deliveries).toEqual([]);
  });

  it("given_valid_subscriptions_and_github_delivery_log__when_listing__then_returns_delivery_counts", async () => {
    const subscriptions = [
      ...SAMPLE_SUBSCRIPTIONS,
      {
        id: "github",
        displayName: "GitHub inbound",
        url: "http://127.0.0.1/api/webhooks/github",
        eventTypes: [WEBHOOK_EVENT_TYPES.TicketChanged],
        enabled: true,
        createdAt: "2026-04-23T10:00:00.000Z",
      },
    ];
    const subscriptionsFile = await writeFixture(JSON.stringify(subscriptions), "with-delivery");
    const deliveriesFile = await writeFixture(
      `${JSON.stringify(githubDeliveryLogEntry())}\n`,
      "deliveries"
    );
    process.env[WEBHOOKS_FILE_ENV] = subscriptionsFile;
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = deliveriesFile;

    const result = await listWebhooksOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.deliveries).toHaveLength(1);
    expect(result.snapshot.deliveries[0]).toMatchObject({
      id: "github:delivery-1",
      subscriptionId: "github",
      eventType: WEBHOOK_EVENT_TYPES.TicketChanged,
      status: "delivered",
    });

    const githubListing = result.snapshot.subscriptions.find(
      (listing) => listing.subscription.id === "github"
    );
    expect(githubListing).toBeDefined();
    expect(githubListing!.deliveryCount).toBe(1);
    expect(githubListing!.lastDeliveryAt).toBe("2026-04-23T12:00:00.000Z");

    const loaded = await loadWebhookOrUndefined("github");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.deliveries).toHaveLength(1);
    expect(loaded.deliveries[0]!.id).toBe("github:delivery-1");
  });

  it("given_a_valid_file__when_loading_by_id__then_returns_the_listing", async () => {
    const file = await writeFixture(JSON.stringify(SAMPLE_SUBSCRIPTIONS), "valid-load");
    process.env[WEBHOOKS_FILE_ENV] = file;

    const result = await loadWebhookOrUndefined("sub-session");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.subscription.id).toBe("sub-session");
    expect(result.sourceFile).toBe(file);
    expect(result.deliveries).toEqual([]);
  });

  it("given_unknown_id__when_loading_by_id__then_returns_not_found", async () => {
    const file = await writeFixture(JSON.stringify(SAMPLE_SUBSCRIPTIONS), "valid-not-found");
    process.env[WEBHOOKS_FILE_ENV] = file;

    const result = await loadWebhookOrUndefined("sub-does-not-exist");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("given_no_env_var__when_loading_by_id__then_returns_unconfigured", async () => {
    const result = await loadWebhookOrUndefined("sub-session");
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  async function writeFixture(contents: string, label: string): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), `control-plane-webhooks-${label}-`));
    tempDirs.push(dir);
    const filePath = path.join(dir, "subscriptions.json");
    await writeFile(filePath, contents, "utf8");
    return filePath;
  }
});

function githubDeliveryLogEntry(): Record<string, unknown> {
  return {
    id: "webhook.delivery_changed:event-1",
    type: "webhook.delivery_changed",
    occurredAt: "2026-04-23T12:00:00.000Z",
    source: {
      kind: "github.webhook",
      id: "github",
    },
    payload: {
      id: "github:delivery-1",
      subscriptionId: "github",
      eventType: WEBHOOK_EVENT_TYPES.TicketChanged,
      attemptedAt: "2026-04-23T12:00:00.000Z",
      status: "delivered",
      responseStatus: 202,
      responseBody: "accepted",
      requestHeaders: {
        "x-github-delivery": "delivery-1",
        "x-github-event": "issues",
      },
      metadata: {
        provider: "github",
        githubEvent: "issues",
        githubDelivery: "delivery-1",
      },
    },
    metadata: {
      provider: "github",
      githubEvent: "issues",
      githubDelivery: "delivery-1",
    },
  };
}

function missingDeliveriesFilePath(): string {
  return path.join(
    os.tmpdir(),
    `control-plane-webhook-deliveries-missing-${process.pid}-${Date.now()}-${Math.random()}.jsonl`
  );
}

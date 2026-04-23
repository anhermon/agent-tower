import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WEBHOOK_EVENT_TYPES } from "@control-plane/core";

import {
  GITHUB_WEBHOOK_DELIVERIES_FILE_ENV,
  GITHUB_WEBHOOK_SECRET_ENV,
  type GithubWebhookDeliveryLogEntry,
} from "@/lib/github-webhooks";

import { POST } from "./route.js";

const ROUTE_URL = "http://127.0.0.1/api/webhooks/github";

describe("/api/webhooks/github POST", () => {
  const originalSecret = process.env[GITHUB_WEBHOOK_SECRET_ENV];
  const originalDeliveriesFile = process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV];
  const tempDirs: string[] = [];

  beforeEach(() => {
    delete process.env[GITHUB_WEBHOOK_SECRET_ENV];
    delete process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV];
  });

  afterEach(async () => {
    restoreEnv(GITHUB_WEBHOOK_SECRET_ENV, originalSecret);
    restoreEnv(GITHUB_WEBHOOK_DELIVERIES_FILE_ENV, originalDeliveriesFile);

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  it("given_valid_signed_github_payload__when_posted__then_delivery_is_accepted_and_persisted", async () => {
    const deliveriesFile = await createDeliveriesFilePath("success");
    const secret = "github-webhook-secret";
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = deliveriesFile;
    process.env[GITHUB_WEBHOOK_SECRET_ENV] = secret;

    const body = JSON.stringify({
      action: "opened",
      repository: { full_name: "octo/hello-world" },
      sender: { login: "octocat" },
      client_payload: { sessionId: "session-123" },
    });
    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        headers: githubHeaders({
          delivery: "delivery-success",
          event: "issues",
          signature: signGithubBody(body, secret),
        }),
        body,
      })
    );

    expect(response.status).toBe(202);
    const responseBody = (await response.json()) as Record<string, unknown>;
    expect(responseBody.ok).toBe(true);

    const entries = await readDeliveryEntries(deliveriesFile);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.type).toBe("webhook.delivery_changed");
    expect(responseBody.eventId).toBe(entry.id);
    expect(responseBody.deliveryId).toBe(entry.payload.id);
    expect(entry.payload).toMatchObject({
      subscriptionId: "github",
      eventType: WEBHOOK_EVENT_TYPES.TicketChanged,
      status: "delivered",
      responseStatus: 202,
      responseBody: "accepted",
    });
    expect(entry.payload.requestHeaders).toMatchObject({
      "x-github-delivery": "delivery-success",
      "x-github-event": "issues",
      "user-agent": "GitHub-Hookshot/test",
      "content-type": "application/json",
    });
    expect(entry.payload.metadata).toMatchObject({
      provider: "github",
      githubEvent: "issues",
      githubDelivery: "delivery-success",
      signatureVerified: true,
      action: "opened",
      repositoryFullName: "octo/hello-world",
      senderLogin: "octocat",
    });
  });

  it("given_missing_required_github_headers__when_posted__then_returns_bad_request", async () => {
    const deliveriesFile = await createDeliveriesFilePath("missing-headers");
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = deliveriesFile;

    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        body: JSON.stringify({ action: "opened" }),
      })
    );

    expect(response.status).toBe(400);
    const responseBody = (await response.json()) as Record<string, unknown>;
    expect(responseBody).toEqual({
      ok: false,
      error: "missing_headers",
      missing: ["x-github-event", "x-github-delivery"],
    });
    await expectFileMissing(deliveriesFile);
  });

  it("given_invalid_json_payload__when_posted__then_returns_bad_request_without_persisting", async () => {
    const deliveriesFile = await createDeliveriesFilePath("invalid-json");
    const secret = "invalid-json-secret";
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = deliveriesFile;
    process.env[GITHUB_WEBHOOK_SECRET_ENV] = secret;

    const body = "{not-json";
    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        headers: githubHeaders({
          delivery: "delivery-invalid-json",
          event: "issues",
          signature: signGithubBody(body, secret),
        }),
        body,
      })
    );

    expect(response.status).toBe(400);
    const responseBody = (await response.json()) as Record<string, unknown>;
    expect(responseBody.ok).toBe(false);
    expect(responseBody.error).toBe("invalid_json");
    await expectFileMissing(deliveriesFile);
  });

  it("given_no_secret_configured__when_posted__then_returns_service_unavailable_without_persisting", async () => {
    const deliveriesFile = await createDeliveriesFilePath("no-secret");
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = deliveriesFile;

    const body = JSON.stringify({ action: "opened" });
    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        headers: githubHeaders({
          delivery: "delivery-no-secret",
          event: "issues",
          signature: signGithubBody(body, "whatever"),
        }),
        body,
      })
    );

    expect(response.status).toBe(503);
    const responseBody = (await response.json()) as Record<string, unknown>;
    expect(responseBody).toEqual({
      ok: false,
      error: "secret_not_configured",
    });
    await expectFileMissing(deliveriesFile);
  });

  it("given_missing_signature_header__when_posted__then_returns_unauthorized_without_persisting", async () => {
    const deliveriesFile = await createDeliveriesFilePath("missing-signature");
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = deliveriesFile;
    process.env[GITHUB_WEBHOOK_SECRET_ENV] = "missing-sig-secret";

    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        headers: githubHeaders({ delivery: "delivery-missing-sig", event: "issues" }),
        body: JSON.stringify({ action: "opened" }),
      })
    );

    expect(response.status).toBe(401);
    const responseBody = (await response.json()) as Record<string, unknown>;
    expect(responseBody).toEqual({
      ok: false,
      error: "missing_signature",
    });
    await expectFileMissing(deliveriesFile);
  });

  it("given_oversized_content_length__when_posted__then_returns_payload_too_large_without_persisting", async () => {
    const deliveriesFile = await createDeliveriesFilePath("oversized");
    const secret = "oversize-secret";
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = deliveriesFile;
    process.env[GITHUB_WEBHOOK_SECRET_ENV] = secret;

    const body = JSON.stringify({ action: "opened" });
    const headers = new Headers(
      githubHeaders({
        delivery: "delivery-oversized",
        event: "issues",
        signature: signGithubBody(body, secret),
      })
    );
    // Spoof a content-length well above GitHub's 25 MiB ceiling. The guard
    // must reject before we try to buffer the body.
    headers.set("content-length", String(100 * 1024 * 1024));

    const response = await POST(new Request(ROUTE_URL, { method: "POST", headers, body }));

    expect(response.status).toBe(413);
    const responseBody = (await response.json()) as Record<string, unknown>;
    expect(responseBody).toEqual({
      ok: false,
      error: "payload_too_large",
    });
    await expectFileMissing(deliveriesFile);
  });

  it("given_configured_secret_and_bad_signature__when_posted__then_returns_unauthorized_without_persisting", async () => {
    const deliveriesFile = await createDeliveriesFilePath("bad-signature");
    process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV] = deliveriesFile;
    process.env[GITHUB_WEBHOOK_SECRET_ENV] = "expected-secret";

    const body = JSON.stringify({ action: "opened" });
    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        headers: githubHeaders({
          delivery: "delivery-bad-signature",
          event: "issues",
          signature: signGithubBody(body, "wrong-secret"),
        }),
        body,
      })
    );

    expect(response.status).toBe(401);
    const responseBody = (await response.json()) as Record<string, unknown>;
    expect(responseBody).toEqual({
      ok: false,
      error: "signature_verification_failed",
    });
    await expectFileMissing(deliveriesFile);
  });

  async function createDeliveriesFilePath(label: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), `github-webhook-route-${label}-`));
    tempDirs.push(dir);
    return path.join(dir, "deliveries.jsonl");
  }
});

function githubHeaders(input: {
  readonly delivery: string;
  readonly event: string;
  readonly signature?: string;
}): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "GitHub-Hookshot/test",
    "x-github-delivery": input.delivery,
    "x-github-event": input.event,
  };
  if (input.signature) {
    headers["x-hub-signature-256"] = input.signature;
  }
  return headers;
}

function signGithubBody(body: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${digest}`;
}

async function readDeliveryEntries(
  file: string
): Promise<readonly GithubWebhookDeliveryLogEntry[]> {
  const raw = await readFile(file, "utf8");
  return raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as GithubWebhookDeliveryLogEntry);
}

async function expectFileMissing(file: string): Promise<void> {
  await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

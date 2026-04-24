import { describe, expect, it } from "vitest";

import {
  getWebhookVerifier,
  GitHubWebhookVerifier,
  registerWebhookVerifier,
  SlackWebhookVerifier,
  StripeWebhookVerifier,
} from "./webhook-verifier";

describe("webhook-verifier", () => {
  describe("GitHubWebhookVerifier", () => {
    const verifier = new GitHubWebhookVerifier();

    it("verifies valid GitHub signature", () => {
      const secret = "test-secret";
      const body = JSON.stringify({ action: "opened" });
      const signature = `sha256=${require("node:crypto").createHmac("sha256", secret).update(body).digest("hex")}`;
      const request = new Request("http://localhost", {
        headers: {
          "x-hub-signature-256": signature,
          "x-github-delivery": "123",
          "x-github-event": "pull_request",
        },
      });

      const result = verifier.verify(request, body, secret);
      expect(result.verified).toBe(true);
      expect(result.provider).toBe("github");
      expect(result.eventId).toBe("123");
      expect(result.eventType).toBe("pull_request");
    });

    it("rejects invalid signature", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-hub-signature-256": "sha256=invalid",
          "x-github-delivery": "123",
        },
      });

      const result = verifier.verify(request, "body", "secret");
      expect(result.verified).toBe(false);
    });

    it("rejects missing signature", () => {
      const request = new Request("http://localhost");
      const result = verifier.verify(request, "body", "secret");
      expect(result.verified).toBe(false);
    });
  });

  describe("SlackWebhookVerifier", () => {
    const verifier = new SlackWebhookVerifier();

    it("verifies valid Slack signature", () => {
      const secret = "test-secret";
      const body = "payload=test";
      const timestamp = String(Math.floor(Date.now() / 1000));
      const baseString = `v0:${timestamp}:${body}`;
      const signature = `v0=${require("node:crypto").createHmac("sha256", secret).update(baseString).digest("hex")}`;
      const request = new Request("http://localhost", {
        headers: {
          "x-slack-request-timestamp": timestamp,
          "x-slack-signature": signature,
        },
      });

      const result = verifier.verify(request, body, secret);
      expect(result.verified).toBe(true);
      expect(result.provider).toBe("slack");
    });

    it("rejects stale timestamp", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000) - 400),
          "x-slack-signature": "v0=invalid",
        },
      });

      const result = verifier.verify(request, "body", "secret");
      expect(result.verified).toBe(false);
    });
  });

  describe("StripeWebhookVerifier", () => {
    const verifier = new StripeWebhookVerifier();

    it("verifies valid Stripe signature", () => {
      const secret = "test-secret";
      const body = JSON.stringify({ type: "invoice.paid" });
      const expected = require("node:crypto")
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");
      const signature = `v1=${expected},t=1234567890`;
      const request = new Request("http://localhost", {
        headers: {
          "stripe-signature": signature,
          id: "evt_123",
          type: "invoice.paid",
        },
      });

      const result = verifier.verify(request, body, secret);
      expect(result.verified).toBe(true);
      expect(result.provider).toBe("stripe");
      expect(result.eventId).toBe("evt_123");
      expect(result.eventType).toBe("invoice.paid");
    });
  });

  describe("getWebhookVerifier", () => {
    it("returns GitHub verifier", () => {
      const verifier = getWebhookVerifier("github");
      expect(verifier).toBeInstanceOf(GitHubWebhookVerifier);
    });

    it("returns Slack verifier", () => {
      const verifier = getWebhookVerifier("slack");
      expect(verifier).toBeInstanceOf(SlackWebhookVerifier);
    });

    it("returns undefined for unknown provider", () => {
      const verifier = getWebhookVerifier("unknown");
      expect(verifier).toBeUndefined();
    });
  });

  describe("registerWebhookVerifier", () => {
    it("registers custom verifier", () => {
      const customVerifier = new GitHubWebhookVerifier();
      registerWebhookVerifier("custom", customVerifier);
      expect(getWebhookVerifier("custom")).toBe(customVerifier);
    });
  });
});

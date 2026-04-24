import { randomUUID } from "node:crypto";

import {
  ControlPlaneEventType,
  EVENT_ENVELOPE_VERSION,
  EventSourceKind,
} from "@control-plane/events";

import {
  type GithubWebhookHeaders,
  getConfiguredGithubWebhookSecret,
  parseGithubWebhookJson,
  persistGithubWebhookDelivery,
  validateGithubWebhookHeaders,
} from "@/lib/github-webhooks";
import { getWebhookVerifier } from "@/lib/webhook-verifier";
import { eventBus } from "@/lib/event-bus";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GitHub caps webhook payloads at 25 MiB; anything larger is never legitimate
// and reading it would buffer attacker-controlled bytes before HMAC can reject.
const MAX_BODY_BYTES = 26 * 1024 * 1024;

async function githubWebhookHandler(request: Request): Promise<Response> {
  const validation = validateGithubWebhookHeaders(request.headers);
  if (!validation.ok) {
    return Response.json(
      { ok: false, error: "missing_headers", missing: validation.missing },
      { status: 400 }
    );
  }

  // Fail-closed: without a shared secret we cannot verify authenticity, so
  // refuse to persist anything. A public endpoint that accepts unsigned
  // payloads is an attacker-controlled write primitive against the local log.
  const secret = getConfiguredGithubWebhookSecret();
  if (!secret) {
    return Response.json({ ok: false, error: "secret_not_configured" }, { status: 503 });
  }

  if (!validation.headers.signature256) {
    return Response.json({ ok: false, error: "missing_signature" }, { status: 401 });
  }

  const verifier = getWebhookVerifier("github");
  if (!verifier) {
    return Response.json({ ok: false, error: "verifier_not_found" }, { status: 500 });
  }

  const sizeError = checkContentLength(request.headers);
  if (sizeError) return sizeError;

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const verification = verifier.verify(request, rawBody, secret);

  if (!verification.verified) {
    return Response.json({ ok: false, error: "signature_verification_failed" }, { status: 401 });
  }

  return persistDelivery(validation.headers, rawBody, verification.verified);
}

function checkContentLength(headers: Headers): Response | null {
  const contentLengthHeader = headers.get("content-length");
  if (contentLengthHeader === null) return null;
  const contentLength = Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  return null;
}

async function persistDelivery(
  headers: GithubWebhookHeaders,
  rawBody: string,
  signatureVerified: boolean
): Promise<Response> {
  let payload: unknown;
  try {
    payload = parseGithubWebhookJson(rawBody);
  } catch (error) {
    return Response.json(
      { ok: false, error: "invalid_json", message: errorMessage(error) },
      { status: 400 }
    );
  }

  let entry: Awaited<ReturnType<typeof persistGithubWebhookDelivery>>;
  try {
    entry = await persistGithubWebhookDelivery({ headers, payload, signatureVerified });
  } catch (error) {
    return Response.json(
      { ok: false, error: "delivery_persist_failed", message: errorMessage(error) },
      { status: 500 }
    );
  }

  try {
    await eventBus.publish({
      id: randomUUID(),
      type: ControlPlaneEventType.WebhookReceived,
      version: EVENT_ENVELOPE_VERSION,
      occurredAt: new Date().toISOString(),
      source: {
        kind: EventSourceKind.Webhook,
        id: headers.delivery,
      },
      payload,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: "event_publish_failed", message: errorMessage(error) },
      { status: 500 }
    );
  }

  return Response.json(
    { ok: true, eventId: entry.id, deliveryId: entry.payload.id },
    { status: 202 }
  );
}

export const POST = withAudit("api.webhooks.github", githubWebhookHandler);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

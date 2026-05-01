import "server-only";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
  type WebhookSubscription,
} from "@control-plane/core";

import { getConfiguredWebhooksFile, __clearWebhooksCacheForTests } from "./webhooks-source";

/**
 * Server-only write helpers for webhook subscription CRUD.
 *
 * All mutations operate on the JSON file pointed to by
 * `CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE`. Each mutation:
 *   1. Reads the current file (or starts from an empty array).
 *   2. Applies the change.
 *   3. Writes the file back atomically via a temp rename (best-effort;
 *      Node.js fs.writeFile is not strictly atomic but sufficient for
 *      a local-first tool without concurrent writers).
 *   4. Invalidates the read-through snapshot cache so the next read
 *      reflects the change immediately.
 */

export type WebhookWriteResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "not_found" | "error";
      readonly message: string;
    };

export interface CreateWebhookInput {
  readonly displayName: string;
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly enabled: boolean;
  readonly secretRef?: string;
}

export interface UpdateWebhookInput {
  readonly displayName?: string;
  readonly url?: string;
  readonly eventTypes?: readonly string[];
  readonly enabled?: boolean;
  readonly secretRef?: string;
}

export async function createWebhookSubscription(
  input: CreateWebhookInput
): Promise<WebhookWriteResult<WebhookSubscription>> {
  const file = getConfiguredWebhooksFile();
  if (!file)
    return {
      ok: false,
      reason: "unconfigured",
      message: "CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE is not set.",
    };

  const validation = validateEventTypes(input.eventTypes);
  if (!validation.ok) return { ok: false, reason: "error", message: validation.message };

  try {
    const subscriptions = await readSubscriptionsFromFile(file);
    const newSub: WebhookSubscription = {
      id: randomUUID(),
      url: input.url.trim(),
      displayName: input.displayName.trim() || undefined,
      eventTypes: validation.eventTypes,
      enabled: input.enabled,
      createdAt: new Date().toISOString(),
      ...(input.secretRef ? { secretRef: input.secretRef.trim() } : {}),
    };
    subscriptions.push(newSub);
    await writeSubscriptionsToFile(file, subscriptions);
    __clearWebhooksCacheForTests();
    return { ok: true, value: newSub };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

export async function updateWebhookSubscription(
  id: string,
  input: UpdateWebhookInput
): Promise<WebhookWriteResult<WebhookSubscription>> {
  const file = getConfiguredWebhooksFile();
  if (!file)
    return {
      ok: false,
      reason: "unconfigured",
      message: "CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE is not set.",
    };

  try {
    const subscriptions = await readSubscriptionsFromFile(file);
    const index = subscriptions.findIndex((s) => s.id === id);
    if (index === -1)
      return { ok: false, reason: "not_found", message: `Webhook ${id} not found.` };

    const existing = subscriptions[index];
    let eventTypes = existing.eventTypes;
    if (input.eventTypes !== undefined) {
      const validation = validateEventTypes(input.eventTypes);
      if (!validation.ok) return { ok: false, reason: "error", message: validation.message };
      eventTypes = validation.eventTypes;
    }

    const updated: WebhookSubscription = {
      ...existing,
      url: input.url !== undefined ? input.url.trim() : existing.url,
      eventTypes,
      enabled: input.enabled ?? existing.enabled,
      ...(input.displayName !== undefined
        ? input.displayName.trim().length > 0
          ? { displayName: input.displayName.trim() }
          : {}
        : existing.displayName !== undefined
          ? { displayName: existing.displayName }
          : {}),
      ...(input.secretRef !== undefined
        ? input.secretRef.trim().length > 0
          ? { secretRef: input.secretRef.trim() }
          : {}
        : existing.secretRef !== undefined
          ? { secretRef: existing.secretRef }
          : {}),
    };

    subscriptions[index] = updated;
    await writeSubscriptionsToFile(file, subscriptions);
    __clearWebhooksCacheForTests();
    return { ok: true, value: updated };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

export async function deleteWebhookSubscription(
  id: string
): Promise<WebhookWriteResult<{ readonly deleted: string }>> {
  const file = getConfiguredWebhooksFile();
  if (!file)
    return {
      ok: false,
      reason: "unconfigured",
      message: "CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE is not set.",
    };

  try {
    const subscriptions = await readSubscriptionsFromFile(file);
    const index = subscriptions.findIndex((s) => s.id === id);
    if (index === -1)
      return { ok: false, reason: "not_found", message: `Webhook ${id} not found.` };

    subscriptions.splice(index, 1);
    await writeSubscriptionsToFile(file, subscriptions);
    __clearWebhooksCacheForTests();
    return { ok: true, value: { deleted: id } };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readSubscriptionsFromFile(file: string): Promise<WebhookSubscription[]> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPlainObject).map((item) => item as unknown as WebhookSubscription);
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) return [];
    throw error;
  }
}

async function writeSubscriptionsToFile(
  file: string,
  subscriptions: readonly WebhookSubscription[]
): Promise<void> {
  await writeFile(file, JSON.stringify(subscriptions, null, 2), "utf8");
}

function validateEventTypes(
  raw: readonly string[]
): { ok: true; eventTypes: readonly WebhookEventType[] } | { ok: false; message: string } {
  const valid = new Set<string>(Object.values(WEBHOOK_EVENT_TYPES));
  const result: WebhookEventType[] = [];
  for (const entry of raw) {
    if (!valid.has(entry)) {
      return { ok: false, message: `Unknown event type: ${entry}` };
    }
    if (!result.includes(entry as WebhookEventType)) {
      result.push(entry as WebhookEventType);
    }
  }
  if (result.length === 0) {
    return { ok: false, message: "At least one event type is required." };
  }
  return { ok: true, eventTypes: result };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

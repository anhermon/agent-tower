import { readFile, stat } from "node:fs/promises";
import {
  WEBHOOK_EVENT_TYPES,
  type WebhookDelivery,
  type WebhookEventType,
  type WebhookSubscription,
} from "@control-plane/core";
import {
  InMemoryWebhookRepository,
  type WebhookRecord,
  WebhookStatus,
} from "@control-plane/storage";
import {
  getGithubWebhookDeliveriesFileCacheKey,
  readGithubWebhookDeliveriesFromFile,
} from "./github-webhooks";

/**
 * Server-only data derivation for the Webhooks module.
 *
 * Resolution order:
 *   1. `CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE` environment variable — an
 *      absolute path to a JSON file matching the canonical
 *      {@link WebhookSubscription}[] shape (the file is opt-in and never
 *      auto-created).
 *   2. No env var → `{ ok: false, reason: "unconfigured" }` — the UI
 *      renders a truthful empty state with configuration guidance. No
 *      seed data, no mocks.
 *
 * The in-memory {@link InMemoryWebhookRepository} from `@control-plane/storage`
 * is used as the read-through cache; each request rebuilds it from the file
 * on disk (keyed by `path:mtime`) so edits are picked up between requests.
 *
 * GitHub inbound webhook deliveries are read from the local JSONL log owned by
 * `github-webhooks.ts`. If that file has not been created yet, `deliveries`
 * remains an empty array — the UI must render a truthful empty state and never
 * fabricate rows.
 */

export const WEBHOOKS_FILE_ENV = "CLAUDE_CONTROL_PLANE_WEBHOOKS_FILE";

export interface WebhookSubscriptionListing {
  readonly subscription: WebhookSubscription;
  /**
   * Derived from the deliveries array for this subscription. Always `null`
   * while Phase 2 v1 keeps deliveries empty — kept as a field so the UI can
   * surface the column today and adopt real data without schema churn.
   */
  readonly lastDeliveryAt: string | null;
  readonly deliveryCount: number;
}

export interface WebhooksSnapshot {
  readonly subscriptions: readonly WebhookSubscriptionListing[];
  readonly deliveries: readonly WebhookDelivery[];
  readonly sourceFile: string;
}

export type ListWebhooksResult =
  | { readonly ok: true; readonly snapshot: WebhooksSnapshot }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "error";
      readonly message?: string;
    };

export type LoadWebhookResult =
  | {
      readonly ok: true;
      readonly listing: WebhookSubscriptionListing;
      readonly deliveries: readonly WebhookDelivery[];
      readonly sourceFile: string;
    }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "not_found" | "error";
      readonly message?: string;
    };

export function getConfiguredWebhooksFile(): string | null {
  const raw = process.env[WEBHOOKS_FILE_ENV];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

interface SnapshotCacheEntry {
  readonly key: string;
  readonly snapshot: WebhooksSnapshot;
}

const snapshotCache = new Map<string, SnapshotCacheEntry>();

export async function listWebhooksOrEmpty(): Promise<ListWebhooksResult> {
  const file = getConfiguredWebhooksFile();
  if (!file) return { ok: false, reason: "unconfigured" };

  try {
    const snapshot = await buildSnapshot(file);
    return { ok: true, snapshot };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

export async function loadWebhookOrUndefined(id: string): Promise<LoadWebhookResult> {
  const file = getConfiguredWebhooksFile();
  if (!file) return { ok: false, reason: "unconfigured" };

  try {
    const snapshot = await buildSnapshot(file);
    const listing = snapshot.subscriptions.find((candidate) => candidate.subscription.id === id);
    if (!listing) {
      return { ok: false, reason: "not_found" };
    }
    const deliveries = snapshot.deliveries.filter((delivery) => delivery.subscriptionId === id);
    return { ok: true, listing, deliveries, sourceFile: snapshot.sourceFile };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

async function buildSnapshot(file: string): Promise<WebhooksSnapshot> {
  const info = await stat(file);
  const deliveriesCacheKey = await getGithubWebhookDeliveriesFileCacheKey();
  const cacheKey = `${file}:${info.mtime.toISOString()}:${info.size}:${deliveriesCacheKey}`;
  const cached = snapshotCache.get(file);
  if (cached && cached.key === cacheKey) {
    return cached.snapshot;
  }

  const raw = await readFile(file, "utf8");
  const parsed = parseJson(raw, file);
  const subscriptions = coerceSubscriptions(parsed, file);

  // Seed the in-memory repository so the derivation uses the same storage
  // surface the rest of the control plane will eventually rely on. Phase 2
  // v1 does not persist across requests, so the repo is rebuilt per call.
  const repo = new InMemoryWebhookRepository();
  for (const subscription of subscriptions) {
    await repo.create(toWebhookRecord(subscription));
  }
  const records = await repo.list();

  const deliveries = await readGithubWebhookDeliveriesFromFile();

  const listings = records.map((record) => toListing(record, deliveries));

  const snapshot: WebhooksSnapshot = {
    subscriptions: listings,
    deliveries,
    sourceFile: file,
  };
  snapshotCache.set(file, { key: cacheKey, snapshot });
  return snapshot;
}

function parseJson(raw: string, file: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse webhook subscriptions JSON at ${file}: ${errorMessage(error)}`
    );
  }
}

function coerceSubscriptions(value: unknown, file: string): readonly WebhookSubscription[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Webhooks file ${file} must contain a JSON array of WebhookSubscription objects.`
    );
  }
  return value.map((entry, index) => coerceSubscription(entry, index, file));
}

function coerceSubscription(value: unknown, index: number, file: string): WebhookSubscription {
  if (!isPlainObject(value)) {
    throw new Error(`Entry ${index} in ${file} is not an object.`);
  }
  const { id, url, eventTypes, enabled, createdAt, secretRef, displayName, metadata } =
    value as Record<string, unknown>;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Entry ${index} in ${file} is missing a string \`id\`.`);
  }
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(`Entry ${id} in ${file} is missing a string \`url\`.`);
  }
  if (typeof enabled !== "boolean") {
    throw new Error(`Entry ${id} in ${file} is missing a boolean \`enabled\`.`);
  }
  if (typeof createdAt !== "string" || createdAt.length === 0) {
    throw new Error(`Entry ${id} in ${file} is missing a string \`createdAt\`.`);
  }
  const normalizedEventTypes = coerceEventTypes(eventTypes, id, file);

  // Build up only the optional fields that were actually present so the
  // resulting value stays compatible with `exactOptionalPropertyTypes` in
  // core.
  const extras: {
    displayName?: string;
    secretRef?: string;
    metadata?: WebhookSubscription["metadata"];
  } = {};
  if (typeof displayName === "string" && displayName.trim().length > 0) {
    extras.displayName = displayName.trim();
  }
  if (typeof secretRef === "string" && secretRef.trim().length > 0) {
    extras.secretRef = secretRef.trim();
  }
  if (isPlainObject(metadata)) {
    extras.metadata = metadata as WebhookSubscription["metadata"];
  }

  return {
    id,
    url,
    enabled,
    createdAt,
    eventTypes: normalizedEventTypes,
    ...extras,
  };
}

function coerceEventTypes(value: unknown, id: string, file: string): readonly WebhookEventType[] {
  if (!Array.isArray(value)) {
    throw new Error(`Entry ${id} in ${file} is missing an \`eventTypes\` array.`);
  }
  const valid = new Set<string>(Object.values(WEBHOOK_EVENT_TYPES));
  const normalized: WebhookEventType[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !valid.has(entry)) {
      throw new Error(
        `Entry ${id} in ${file} contains unknown event type: ${JSON.stringify(entry)}.`
      );
    }
    if (!normalized.includes(entry as WebhookEventType)) {
      normalized.push(entry as WebhookEventType);
    }
  }
  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toWebhookRecord(subscription: WebhookSubscription): WebhookRecord {
  // The storage-side `WebhookRecord` is a slightly different shape — it
  // predates the canonical `WebhookSubscription` and is oriented around
  // received deliveries. We use it as a generic container here keyed on
  // the subscription id so the UI derivation can round-trip through the
  // repository without introducing a new storage shape in this slice.
  return {
    id: subscription.id,
    provider: "subscription",
    status: subscription.enabled ? WebhookStatus.Processed : WebhookStatus.Failed,
    receivedAt: subscription.createdAt,
    headers: {},
    payload: subscription,
  };
}

function fromWebhookRecord(record: WebhookRecord): WebhookSubscription {
  return record.payload as WebhookSubscription;
}

function toListing(
  record: WebhookRecord,
  deliveries: readonly WebhookDelivery[]
): WebhookSubscriptionListing {
  const subscription = fromWebhookRecord(record);
  const forThis = deliveries.filter((delivery) => delivery.subscriptionId === subscription.id);
  const lastDeliveryAt = forThis.reduce<string | null>((latest, delivery) => {
    if (!latest) return delivery.attemptedAt;
    return delivery.attemptedAt > latest ? delivery.attemptedAt : latest;
  }, null);
  return {
    subscription,
    lastDeliveryAt,
    deliveryCount: forThis.length,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Test-only hook: clears the snapshot cache between assertions. */
export function __clearWebhooksCacheForTests(): void {
  snapshotCache.clear();
}

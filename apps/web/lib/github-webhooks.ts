import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  DOMAIN_EVENT_TYPES,
  type JsonObject,
  WEBHOOK_EVENT_TYPES,
  type WebhookDelivery,
  type WebhookEventType,
} from "@control-plane/core";

export const GITHUB_WEBHOOK_SECRET_ENV = "CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_SECRET";
export const GITHUB_WEBHOOK_DELIVERIES_FILE_ENV =
  "CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_DELIVERIES_FILE";
export const GITHUB_WEBHOOK_PROVIDER_ID = "github";
export const GITHUB_WEBHOOK_SUBSCRIPTION_ID = "github";

export const REQUIRED_GITHUB_WEBHOOK_HEADERS = ["x-github-event", "x-github-delivery"] as const;

const GITHUB_SIGNATURE_PREFIX = "sha256=";
const SIGNATURE_HEX_LENGTH = 64;
const DEFAULT_DELIVERIES_RELATIVE_PATH = ".claude/github-webhook-deliveries.jsonl";
const GITHUB_SOURCE_KIND = "github.webhook";
const GITHUB_EVENT_TYPE_MAP: Readonly<Record<string, WebhookEventType>> = {
  check_run: WEBHOOK_EVENT_TYPES.AgentChanged,
  check_suite: WEBHOOK_EVENT_TYPES.AgentChanged,
  deployment: WEBHOOK_EVENT_TYPES.AgentChanged,
  deployment_status: WEBHOOK_EVENT_TYPES.AgentChanged,
  issues: WEBHOOK_EVENT_TYPES.TicketChanged,
  issue_comment: WEBHOOK_EVENT_TYPES.TicketChanged,
  pull_request: WEBHOOK_EVENT_TYPES.TicketChanged,
  pull_request_review: WEBHOOK_EVENT_TYPES.TicketChanged,
  pull_request_review_comment: WEBHOOK_EVENT_TYPES.TicketChanged,
  workflow_job: WEBHOOK_EVENT_TYPES.AgentChanged,
  workflow_run: WEBHOOK_EVENT_TYPES.AgentChanged,
};

export type RequiredGithubWebhookHeader = (typeof REQUIRED_GITHUB_WEBHOOK_HEADERS)[number];

export interface GithubWebhookHeaders {
  readonly event: string;
  readonly delivery: string;
  readonly signature256: string | null;
  readonly hookId: string | null;
  readonly targetId: string | null;
  readonly userAgent: string | null;
  readonly contentType: string | null;
}

export type GithubWebhookHeaderValidation =
  | { readonly ok: true; readonly headers: GithubWebhookHeaders }
  | {
      readonly ok: false;
      readonly missing: readonly RequiredGithubWebhookHeader[];
    };

export interface GithubWebhookDeliveryLogEntry {
  readonly id: string;
  readonly type: typeof DOMAIN_EVENT_TYPES.WebhookDeliveryChanged;
  readonly occurredAt: string;
  readonly source: {
    readonly kind: typeof GITHUB_SOURCE_KIND;
    readonly id: typeof GITHUB_WEBHOOK_PROVIDER_ID;
  };
  readonly payload: WebhookDelivery;
  readonly metadata: JsonObject;
}

interface PersistGithubWebhookDeliveryInput {
  readonly headers: GithubWebhookHeaders;
  readonly payload: unknown;
  readonly signatureVerified: boolean;
  readonly receivedAt?: Date;
}

export function getConfiguredGithubWebhookSecret(): string | null {
  const raw = process.env[GITHUB_WEBHOOK_SECRET_ENV];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getGithubWebhookDeliveriesFile(): string {
  const raw = process.env[GITHUB_WEBHOOK_DELIVERIES_FILE_ENV];
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return path.join(process.cwd(), DEFAULT_DELIVERIES_RELATIVE_PATH);
}

export function validateGithubWebhookHeaders(headers: Headers): GithubWebhookHeaderValidation {
  const missing = REQUIRED_GITHUB_WEBHOOK_HEADERS.filter(
    (name) => normalizeHeaderValue(headers.get(name)) === null
  );
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    headers: {
      event: normalizeHeaderValue(headers.get("x-github-event"))!,
      delivery: normalizeHeaderValue(headers.get("x-github-delivery"))!,
      signature256: normalizeHeaderValue(headers.get("x-hub-signature-256")),
      hookId: normalizeHeaderValue(headers.get("x-github-hook-id")),
      targetId: normalizeHeaderValue(headers.get("x-github-hook-installation-target-id")),
      userAgent: normalizeHeaderValue(headers.get("user-agent")),
      contentType: normalizeHeaderValue(headers.get("content-type")),
    },
  };
}

export function verifyGithubWebhookSignature(input: {
  readonly body: string;
  readonly signatureHeader: string | null;
  readonly secret: string;
}): boolean {
  const signatureHeader = input.signatureHeader?.trim();
  if (!signatureHeader?.startsWith(GITHUB_SIGNATURE_PREFIX)) return false;

  const providedHex = signatureHeader.slice(GITHUB_SIGNATURE_PREFIX.length);
  if (!isSha256HexDigest(providedHex)) return false;

  const expectedHex = createHmac("sha256", input.secret).update(input.body, "utf8").digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");

  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function parseGithubWebhookJson(rawBody: string): unknown {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!isPlainObject(parsed)) {
      throw new Error("GitHub webhook payload must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid GitHub webhook JSON: ${errorMessage(error)}`);
  }
}

export async function persistGithubWebhookDelivery(
  input: PersistGithubWebhookDeliveryInput
): Promise<GithubWebhookDeliveryLogEntry> {
  const entry = buildGithubWebhookDeliveryLogEntry(input);
  await appendGithubWebhookDeliveryLogEntry(entry);
  return entry;
}

export async function appendGithubWebhookDeliveryLogEntry(
  entry: GithubWebhookDeliveryLogEntry,
  file = getGithubWebhookDeliveriesFile()
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readGithubWebhookDeliveriesFromFile(
  file = getGithubWebhookDeliveriesFile()
): Promise<readonly WebhookDelivery[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) return [];
    throw error;
  }

  const deliveries: WebhookDelivery[] = [];
  const lines = raw.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    deliveries.push(parseWebhookDeliveryLogLine(trimmed, file, index + 1));
  }
  return deliveries;
}

export async function getGithubWebhookDeliveriesFileCacheKey(
  file = getGithubWebhookDeliveriesFile()
): Promise<string> {
  try {
    const info = await stat(file);
    return `${file}:${info.mtime.toISOString()}:${info.size}`;
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) return `${file}:missing`;
    throw error;
  }
}

function buildGithubWebhookDeliveryLogEntry(
  input: PersistGithubWebhookDeliveryInput
): GithubWebhookDeliveryLogEntry {
  const occurredAt = (input.receivedAt ?? new Date()).toISOString();
  const delivery: WebhookDelivery = {
    id: `${GITHUB_WEBHOOK_PROVIDER_ID}:${input.headers.delivery}:${randomUUID()}`,
    subscriptionId: GITHUB_WEBHOOK_SUBSCRIPTION_ID,
    eventType: toWebhookEventType(input.headers.event),
    attemptedAt: occurredAt,
    status: "delivered",
    responseStatus: 202,
    responseBody: "accepted",
    requestHeaders: toStoredRequestHeaders(input.headers),
    metadata: toDeliveryMetadata(input),
  };

  return {
    id: `${DOMAIN_EVENT_TYPES.WebhookDeliveryChanged}:${randomUUID()}`,
    type: DOMAIN_EVENT_TYPES.WebhookDeliveryChanged,
    occurredAt,
    source: {
      kind: GITHUB_SOURCE_KIND,
      id: GITHUB_WEBHOOK_PROVIDER_ID,
    },
    payload: delivery,
    metadata: {
      provider: GITHUB_WEBHOOK_PROVIDER_ID,
      githubEvent: input.headers.event,
      githubDelivery: input.headers.delivery,
    },
  };
}

function toWebhookEventType(githubEvent: string): WebhookEventType {
  return GITHUB_EVENT_TYPE_MAP[githubEvent] ?? WEBHOOK_EVENT_TYPES.TicketChanged;
}

function toStoredRequestHeaders(headers: GithubWebhookHeaders): JsonObject {
  const stored: Record<string, string> = {
    "x-github-delivery": headers.delivery,
    "x-github-event": headers.event,
  };
  if (headers.hookId) stored["x-github-hook-id"] = headers.hookId;
  if (headers.targetId) {
    stored["x-github-hook-installation-target-id"] = headers.targetId;
  }
  if (headers.userAgent) stored["user-agent"] = headers.userAgent;
  if (headers.contentType) stored["content-type"] = headers.contentType;
  return stored;
}

function toDeliveryMetadata(input: PersistGithubWebhookDeliveryInput): JsonObject {
  const metadata: Record<string, string | boolean> = {
    provider: GITHUB_WEBHOOK_PROVIDER_ID,
    githubEvent: input.headers.event,
    githubDelivery: input.headers.delivery,
    signatureVerified: input.signatureVerified,
  };

  const action = getNestedString(input.payload, ["action"]);
  if (action) metadata.action = action;

  const repositoryFullName = getNestedString(input.payload, ["repository", "full_name"]);
  if (repositoryFullName) metadata.repositoryFullName = repositoryFullName;

  const senderLogin = getNestedString(input.payload, ["sender", "login"]);
  if (senderLogin) metadata.senderLogin = senderLogin;

  const sessionId =
    getNestedString(input.payload, ["sessionId"]) ??
    getNestedString(input.payload, ["session_id"]) ??
    getNestedString(input.payload, ["session", "id"]) ??
    getNestedString(input.payload, ["client_payload", "sessionId"]) ??
    getNestedString(input.payload, ["client_payload", "session_id"]) ??
    getNestedString(input.payload, ["check_run", "external_id"]);
  if (sessionId) metadata.sessionId = sessionId;

  return metadata;
}

function parseWebhookDeliveryLogLine(
  line: string,
  file: string,
  lineNumber: number
): WebhookDelivery {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse GitHub webhook delivery JSONL at ${file}:${lineNumber}: ${errorMessage(
        error
      )}`
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`GitHub webhook delivery entry at ${file}:${lineNumber} is not an object.`);
  }
  const candidate = isPlainObject(parsed.payload) ? parsed.payload : parsed;
  return coerceWebhookDelivery(candidate, file, lineNumber);
}

function coerceWebhookDelivery(value: unknown, file: string, lineNumber: number): WebhookDelivery {
  if (!isPlainObject(value)) {
    throw new Error(`GitHub webhook delivery payload at ${file}:${lineNumber} is not an object.`);
  }

  const { id, subscriptionId, eventType, attemptedAt, status } = value;
  validateRequiredDeliveryFields(
    value,
    id,
    subscriptionId,
    eventType,
    attemptedAt,
    status,
    file,
    lineNumber
  );

  // After validateRequiredDeliveryFields, these are guaranteed to be the right types.
  const optional = buildOptionalDeliveryFields(value);

  return {
    id: id as string,
    subscriptionId: subscriptionId as string,
    eventType: eventType as WebhookEventType,
    attemptedAt: attemptedAt as string,
    status: status as WebhookDelivery["status"],
    ...optional,
  };
}

function validateRequiredDeliveryFields(
  _value: Record<string, unknown>,
  id: unknown,
  subscriptionId: unknown,
  eventType: unknown,
  attemptedAt: unknown,
  status: unknown,
  file: string,
  lineNumber: number
): void {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`GitHub webhook delivery at ${file}:${lineNumber} is missing an id.`);
  }
  if (typeof subscriptionId !== "string" || subscriptionId.length === 0) {
    throw new Error(
      `GitHub webhook delivery ${String(id)} at ${file}:${lineNumber} is missing a subscriptionId.`
    );
  }
  if (!isWebhookEventType(eventType)) {
    throw new Error(
      `GitHub webhook delivery ${String(id)} at ${file}:${lineNumber} has an eventType.`
    );
  }
  if (typeof attemptedAt !== "string" || attemptedAt.length === 0) {
    throw new Error(
      `GitHub webhook delivery ${String(id)} at ${file}:${lineNumber} is missing attemptedAt.`
    );
  }
  if (!isWebhookDeliveryStatus(status)) {
    throw new Error(
      `GitHub webhook delivery ${String(id)} at ${file}:${lineNumber} has an invalid status.`
    );
  }
}

function buildOptionalDeliveryFields(value: Record<string, unknown>): {
  responseStatus?: number;
  responseBody?: string;
  requestHeaders?: JsonObject;
  metadata?: JsonObject;
} {
  const optional: {
    responseStatus?: number;
    responseBody?: string;
    requestHeaders?: JsonObject;
    metadata?: JsonObject;
  } = {};
  const { responseStatus, responseBody, requestHeaders, metadata } = value;
  if (typeof responseStatus === "number") optional.responseStatus = responseStatus;
  if (typeof responseBody === "string") optional.responseBody = responseBody;
  if (isPlainObject(requestHeaders)) optional.requestHeaders = requestHeaders as JsonObject;
  if (isPlainObject(metadata)) optional.metadata = metadata as JsonObject;
  return optional;
}

function isWebhookEventType(value: unknown): value is WebhookEventType {
  return (
    typeof value === "string" &&
    (Object.values(WEBHOOK_EVENT_TYPES) as readonly string[]).includes(value)
  );
}

function isWebhookDeliveryStatus(value: unknown): value is WebhookDelivery["status"] {
  return value === "pending" || value === "delivered" || value === "failed";
}

function normalizeHeaderValue(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSha256HexDigest(value: string): boolean {
  return value.length === SIGNATURE_HEX_LENGTH && /^[a-f0-9]+$/i.test(value);
}

function getNestedString(value: unknown, pathSegments: readonly string[]): string | null {
  let current = value;
  for (const segment of pathSegments) {
    if (!isPlainObject(current)) return null;
    current = current[segment];
  }
  return normalizeHeaderValue(typeof current === "string" ? current : null);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

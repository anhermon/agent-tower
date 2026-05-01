import "server-only";

import type { JsonObject, WebhookDelivery } from "@control-plane/core";

import { readGithubWebhookDeliveriesFromFile } from "./github-webhooks";

/**
 * Server-only data derivation for the GitHub per-integration webhook view.
 *
 * Reads the local GitHub webhook deliveries JSONL file and groups deliveries
 * by repository so the UI can show per-repo counts and event-type breakdowns
 * (PRs, Issues, CI/CD) without any GitHub API calls.
 */

export interface GithubRepoGroup {
  readonly repoFullName: string;
  readonly deliveryCount: number;
  readonly lastDeliveryAt: string | null;
  readonly prCount: number;
  readonly issueCount: number;
  readonly ciCount: number;
  readonly otherCount: number;
  readonly recentDeliveries: readonly GithubDeliveryRow[];
}

export interface GithubDeliveryRow {
  readonly id: string;
  readonly githubDeliveryId: string;
  readonly githubEvent: string;
  readonly action: string | null;
  readonly repoFullName: string;
  readonly senderLogin: string | null;
  readonly status: WebhookDelivery["status"];
  readonly signatureVerified: boolean;
  readonly attemptedAt: string;
}

export type GithubWebhookViewResult =
  | {
      readonly ok: true;
      readonly repos: readonly GithubRepoGroup[];
      readonly totalDeliveries: number;
      readonly totalRepos: number;
    }
  | { readonly ok: false; readonly reason: "error"; readonly message: string };

const GITHUB_PR_EVENTS = new Set([
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "pull_request_review_thread",
]);
const GITHUB_ISSUE_EVENTS = new Set(["issues", "issue_comment"]);
const GITHUB_CI_EVENTS = new Set([
  "check_run",
  "check_suite",
  "workflow_run",
  "workflow_job",
  "deployment",
  "deployment_status",
]);

export async function loadGithubWebhookView(): Promise<GithubWebhookViewResult> {
  try {
    const deliveries = await readGithubWebhookDeliveriesFromFile();
    const rows = deliveries.map(toDeliveryRow);
    const repoMap = new Map<string, GithubDeliveryRow[]>();

    for (const row of rows) {
      const existing = repoMap.get(row.repoFullName) ?? [];
      existing.push(row);
      repoMap.set(row.repoFullName, existing);
    }

    const repos: GithubRepoGroup[] = Array.from(repoMap.entries())
      .map(([repoFullName, repoRows]) => buildRepoGroup(repoFullName, repoRows))
      .sort((a, b) => {
        // Most recently active first
        if (a.lastDeliveryAt && b.lastDeliveryAt) {
          return b.lastDeliveryAt.localeCompare(a.lastDeliveryAt);
        }
        return b.deliveryCount - a.deliveryCount;
      });

    return {
      ok: true,
      repos,
      totalDeliveries: deliveries.length,
      totalRepos: repos.length,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildRepoGroup(repoFullName: string, rows: readonly GithubDeliveryRow[]): GithubRepoGroup {
  const lastDeliveryAt = rows.reduce<string | null>((latest, row) => {
    if (!latest) return row.attemptedAt;
    return row.attemptedAt > latest ? row.attemptedAt : latest;
  }, null);

  let prCount = 0;
  let issueCount = 0;
  let ciCount = 0;
  let otherCount = 0;

  for (const row of rows) {
    const evt = row.githubEvent.toLowerCase();
    if (GITHUB_PR_EVENTS.has(evt)) {
      prCount++;
    } else if (GITHUB_ISSUE_EVENTS.has(evt)) {
      issueCount++;
    } else if (GITHUB_CI_EVENTS.has(evt)) {
      ciCount++;
    } else {
      otherCount++;
    }
  }

  return {
    repoFullName,
    deliveryCount: rows.length,
    lastDeliveryAt,
    prCount,
    issueCount,
    ciCount,
    otherCount,
    recentDeliveries: rows
      .slice()
      .sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt))
      .slice(0, 10),
  };
}

function toDeliveryRow(delivery: WebhookDelivery): GithubDeliveryRow {
  const meta = isPlainObject(delivery.metadata) ? delivery.metadata : {};
  const headers = isPlainObject(delivery.requestHeaders) ? delivery.requestHeaders : {};

  const githubEvent =
    stringOrNull(meta.githubEvent) ?? stringOrNull(headers["x-github-event"]) ?? "unknown";
  const repoFullName = stringOrNull(meta.repositoryFullName) ?? "(unknown repo)";

  return {
    id: delivery.id,
    githubDeliveryId:
      stringOrNull(meta.githubDelivery) ??
      stringOrNull(headers["x-github-delivery"]) ??
      delivery.id,
    githubEvent,
    action: stringOrNull(meta.action),
    repoFullName,
    senderLogin: stringOrNull(meta.senderLogin),
    status: delivery.status,
    signatureVerified: meta.signatureVerified === true,
    attemptedAt: delivery.attemptedAt,
  };
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

import { randomUUID } from "node:crypto";

export interface WebhookReceived {
  readonly id: string;
  readonly type: "webhook.received";
  readonly occurredAt: string;
  readonly source: {
    readonly kind: "webhook";
    readonly provider: "github" | "bitbucket";
    readonly id: string;
  };
  readonly payload: {
    readonly eventType: string;
    readonly action: string;
    readonly repositoryFullName: string;
    readonly senderLogin: string;
    readonly rawPayload: unknown;
  };
}

export function normalizeGithubWebhook(params: {
  headers: Record<string, string | string[]>;
  body: unknown;
}): WebhookReceived {
  const body = params.body as Record<string, unknown>;
  const deliveryId = String(params.headers["x-github-delivery"] ?? randomUUID());

  return {
    id: randomUUID(),
    type: "webhook.received",
    occurredAt: new Date().toISOString(),
    source: {
      kind: "webhook",
      provider: "github",
      id: deliveryId,
    },
    payload: {
      eventType: String(params.headers["x-github-event"] ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- payload fields are `unknown`; String() coercion is intentional
      action: String(body?.action ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- payload fields are `unknown`; String() coercion is intentional
      repositoryFullName: String((body?.repository as Record<string, unknown>)?.full_name ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- payload fields are `unknown`; String() coercion is intentional
      senderLogin: String((body?.sender as Record<string, unknown>)?.login ?? ""),
      rawPayload: body,
    },
  };
}

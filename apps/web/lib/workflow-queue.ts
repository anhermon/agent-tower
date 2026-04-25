import { Queue } from "bullmq";

export interface WorkflowJobData {
  readonly webhookEventId: string;
  readonly webhookEventType: string;
  readonly webhookAction: string;
  readonly repositoryFullName: string;
  readonly senderLogin: string;
  readonly rawPayload: unknown;
  readonly ruleName: string;
  readonly actions: readonly {
    readonly type: string;
    readonly instructions?: string;
    readonly title_template?: string;
    readonly body_template?: string;
  }[];
  readonly repoConfig: {
    readonly version: number;
    readonly enabled: boolean;
    readonly rules: readonly unknown[];
  };
}

const WORKFLOW_QUEUE_NAME = "workflow-jobs";

export function getRedisConnection(): { host: string; port: number } {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || "6379", 10),
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

export function createWorkflowQueue(): Queue<WorkflowJobData> {
  const { host, port } = getRedisConnection();
  return new Queue<WorkflowJobData>(WORKFLOW_QUEUE_NAME, {
    connection: {
      host,
      port,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      lazyConnect: true,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  });
}

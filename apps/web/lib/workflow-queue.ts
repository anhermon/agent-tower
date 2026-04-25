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
  const queue = new Queue<WorkflowJobData>(WORKFLOW_QUEUE_NAME, {
    connection: {
      host,
      port,
      // Do not retry endlessly when Redis is unavailable — fail fast so
      // the bootstrap can degrade gracefully instead of hanging.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
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

  // Swallow connection errors so an unavailable Redis does not produce an
  // unhandled EventEmitter error that crashes the Next.js server process.
  queue.on("error", (_err) => {
    // Errors are already logged by workflow-bootstrap; suppress here to
    // prevent Node's "unhandled 'error' event" fatal throw.
  });

  return queue;
}

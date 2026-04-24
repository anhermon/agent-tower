import { Worker, type Job } from "bullmq";
import { getLogger } from "@control-plane/logger";
import type { WorkflowJobData } from "./workflow-queue";
import type { GitHubActionExecutor } from "./github-actions";
import { renderTemplate } from "./template-renderer";
import { getRedisConnection } from "./workflow-queue";

export interface WorkflowWorker {
  stop(): Promise<void>;
}

export interface WorkflowWorkerDependencies {
  readonly actionExecutor: GitHubActionExecutor;
}

const log = getLogger("workflow-worker");

export function buildTemplateContext(jobData: WorkflowJobData): Record<string, unknown> {
  return {
    payload: jobData.rawPayload,
    event: {
      eventType: jobData.webhookEventType,
      action: jobData.webhookAction,
      repositoryFullName: jobData.repositoryFullName,
      senderLogin: jobData.senderLogin,
    },
  };
}

export async function processWorkflowJob(
  job: Job<WorkflowJobData>,
  actionExecutor: GitHubActionExecutor
): Promise<void> {
  const data = job.data;
  const context = buildTemplateContext(data);

  for (const action of data.actions) {
    try {
      switch (action.type) {
        case "review_pr": {
          const payload = data.rawPayload as Record<string, unknown>;
          let prNumber: number | null = null;
          if (typeof payload.number === "number") {
            prNumber = payload.number;
          } else if (
            payload.pull_request &&
            typeof (payload.pull_request as Record<string, unknown>).number === "number"
          ) {
            prNumber = (payload.pull_request as Record<string, unknown>).number as number;
          }

          if (prNumber === null) {
            throw new Error("Cannot extract pull request number from payload");
          }

          const instructions = action.instructions
            ? renderTemplate(action.instructions, context)
            : "";

          await actionExecutor.reviewPullRequest({
            repoFullName: data.repositoryFullName,
            pullRequestNumber: prNumber,
            instructions,
          });
          break;
        }

        case "respond_comment": {
          const payload = data.rawPayload as Record<string, unknown>;
          let issueNumber: number | null = null;
          if (typeof payload.number === "number") {
            issueNumber = payload.number;
          } else if (
            payload.issue &&
            typeof (payload.issue as Record<string, unknown>).number === "number"
          ) {
            issueNumber = (payload.issue as Record<string, unknown>).number as number;
          }

          if (issueNumber === null) {
            throw new Error("Cannot extract issue number from payload");
          }

          const body = action.instructions ? renderTemplate(action.instructions, context) : "";

          await actionExecutor.createComment({
            repoFullName: data.repositoryFullName,
            issueNumber,
            body,
          });
          break;
        }

        case "create_issue": {
          const title = action.title_template
            ? renderTemplate(action.title_template, context)
            : "Workflow triggered issue";
          const body = action.body_template ? renderTemplate(action.body_template, context) : "";

          await actionExecutor.createIssue({
            repoFullName: data.repositoryFullName,
            title,
            body,
          });
          break;
        }

        default:
          log.warn({ actionType: action.type }, "workflow.worker.unknown_action");
      }
    } catch (error) {
      log.error(
        {
          jobId: job.id,
          actionType: action.type,
          error: error instanceof Error ? error.message : String(error),
        },
        "workflow.worker.action_failed"
      );
      throw error;
    }
  }
}

export function createWorkflowWorker(deps: WorkflowWorkerDependencies): WorkflowWorker {
  const { actionExecutor } = deps;
  const { host, port } = getRedisConnection();

  const worker = new Worker<WorkflowJobData>(
    "workflow-jobs",
    (job: Job<WorkflowJobData>) => processWorkflowJob(job, actionExecutor),
    {
      connection: { host, port },
      concurrency: 1,
    }
  );

  worker.on("error", (err) => {
    log.error({ error: err.message }, "workflow.worker.redis_error");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, error: err.message }, "workflow.worker.job_failed");
  });

  return {
    async stop() {
      await worker.close();
    },
  };
}

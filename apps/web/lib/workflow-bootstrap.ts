import { getLogger } from "@control-plane/logger";

import { eventBus } from "./event-bus";
import { createGitHubActionExecutor } from "./github-actions";
import { createRepoConfigProvider } from "./repo-config";
import { createWorkflowEngine } from "./workflow-engine";
import { createWorkflowQueue } from "./workflow-queue";
import { createWorkflowWorker } from "./workflow-worker";

const log = getLogger("workflow-bootstrap");

let worker: ReturnType<typeof createWorkflowWorker> | undefined;
let engine: ReturnType<typeof createWorkflowEngine> | undefined;

export function startWorkflowEngine(): void {
  if (engine) {
    return;
  }

  const repoConfigProvider = createRepoConfigProvider();

  let jobQueue: ReturnType<typeof createWorkflowQueue>;
  try {
    jobQueue = createWorkflowQueue();
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "workflow.bootstrap.queue_init_failed — workflow engine disabled"
    );
    return;
  }

  engine = createWorkflowEngine({
    eventBus,
    jobQueue,
    repoConfigProvider,
  });

  const actionExecutor = createGitHubActionExecutor();

  try {
    worker = createWorkflowWorker({ actionExecutor });
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "workflow.bootstrap.worker_init_failed — jobs will queue but not be processed"
    );
    // engine is still running; jobs will accumulate in the queue
    // when Redis becomes available and the worker is restarted
  }
}

export async function stopWorkflowEngine(): Promise<void> {
  engine?.stop();
  engine = undefined;

  if (worker) {
    await worker.stop();
    worker = undefined;
  }
}

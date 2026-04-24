import { eventBus } from "./event-bus";
import { createRepoConfigProvider } from "./repo-config";
import { createWorkflowQueue } from "./workflow-queue";
import { createWorkflowEngine } from "./workflow-engine";
import { createGitHubActionExecutor } from "./github-actions";
import { createWorkflowWorker } from "./workflow-worker";

let worker: ReturnType<typeof createWorkflowWorker> | undefined;
let engine: ReturnType<typeof createWorkflowEngine> | undefined;

export function startWorkflowEngine(): void {
  if (engine) {
    return;
  }

  const repoConfigProvider = createRepoConfigProvider();
  const jobQueue = createWorkflowQueue();
  const actionExecutor = createGitHubActionExecutor();

  engine = createWorkflowEngine({
    eventBus,
    jobQueue,
    repoConfigProvider,
  });

  worker = createWorkflowWorker({
    actionExecutor,
  });
}

export async function stopWorkflowEngine(): Promise<void> {
  engine?.stop();
  engine = undefined;

  if (worker) {
    await worker.stop();
    worker = undefined;
  }
}

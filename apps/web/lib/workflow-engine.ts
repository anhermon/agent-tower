import type { EventEnvelope, EventBus } from "@control-plane/events";
import type { Queue } from "bullmq";
import type { RepoConfigProvider, WorkflowAction } from "./repo-config";
import type { WorkflowJobData } from "./workflow-queue";
import { evaluateFilter } from "./filter-evaluator";

export interface WebhookPayload {
  readonly eventType: string;
  readonly action: string;
  readonly repositoryFullName: string;
  readonly senderLogin: string;
  readonly rawPayload: unknown;
}

export type WebhookReceived = EventEnvelope<"webhook.received", WebhookPayload>;

export interface WorkflowEngine {
  stop(): void;
}

export interface WorkflowEngineDependencies {
  readonly eventBus: EventBus;
  readonly jobQueue: Queue<WorkflowJobData>;
  readonly repoConfigProvider: RepoConfigProvider;
}

export function createWorkflowEngine(deps: WorkflowEngineDependencies): WorkflowEngine {
  const { eventBus, jobQueue, repoConfigProvider } = deps;

  const subscription = eventBus.subscribe(async (event) => {
    if (event.type !== "webhook.received") {
      return;
    }

    const webhookEvent = event as WebhookReceived;
    const { repositoryFullName, eventType, action, rawPayload } = webhookEvent.payload;

    const config = await repoConfigProvider.fetchConfig(repositoryFullName);

    if (!config) {
      return;
    }

    if (!config.enabled) {
      return;
    }

    for (const rule of config.rules) {
      const matches = rule.events.some((trigger) => {
        // Check event type matches
        if (trigger.type !== eventType) {
          return false;
        }

        // Check action matches (if specified)
        if (trigger.actions !== undefined && !trigger.actions.includes(action)) {
          return false;
        }

        // Check filter evaluates to true (if specified)
        if (trigger.filter !== undefined) {
          try {
            const filterContext = {
              payload: rawPayload,
              event: {
                eventType,
                action,
                repositoryFullName,
                senderLogin: webhookEvent.payload.senderLogin,
              },
            };
            const filterResult = evaluateFilter(trigger.filter, filterContext);
            if (!filterResult) {
              return false;
            }
          } catch {
            // Filter syntax error or missing property — skip rule per spec
            return false;
          }
        }

        return true;
      });

      if (matches) {
        const jobData: WorkflowJobData = {
          webhookEventId: webhookEvent.id,
          webhookEventType: eventType,
          webhookAction: action,
          repositoryFullName,
          senderLogin: webhookEvent.payload.senderLogin,
          rawPayload,
          ruleName: rule.name,
          actions: rule.actions as WorkflowAction[],
          repoConfig: config,
        };

        await jobQueue.add("execute-workflow", jobData);
      }
    }
  });

  return {
    stop() {
      subscription.unsubscribe();
    },
  };
}

import {
  type EventEnvelope,
  type AppendOnlyEventLog,
  type AsyncEventStream,
  type EventLogAppendResult,
  type EventLogReadOptions,
  type EventLogRecord,
  InMemoryAppendOnlyEventLog,
} from "@control-plane/events";

import type { WebhookReceived } from "./webhook-normalizer";

export interface WorkflowAction {
  readonly type: string;
}

export interface RepoWorkflowConfig {
  readonly rules: readonly unknown[];
}

export interface WorkflowJobPayload {
  readonly status: "pending" | "running" | "completed" | "failed";
  readonly webhookEvent: WebhookReceived;
  readonly ruleName: string;
  readonly actions: readonly WorkflowAction[];
  readonly repoFullName: string;
  readonly repoConfig: RepoWorkflowConfig;
  readonly createdAt: string;
}

export type WorkflowJob = EventEnvelope<"workflow.job_created", WorkflowJobPayload>;

type JobStatus = "pending" | "running" | "completed" | "failed";

/**
 * In-memory job queue for WorkflowJobs. Implements AppendOnlyEventLog so it
 * can be used as the jobQueue dependency in WorkflowEngine, while adding
 * status-tracking methods for the worker.
 */
export class JobQueue implements AppendOnlyEventLog<WorkflowJob> {
  private readonly log = new InMemoryAppendOnlyEventLog<WorkflowJob>();
  private readonly jobs = new Map<string, WorkflowJob>();
  private readonly statusMap = new Map<string, JobStatus>();
  private readonly results = new Map<string, unknown>();
  private readonly errors = new Map<string, unknown>();

  async append(event: WorkflowJob): Promise<EventLogAppendResult<WorkflowJob>> {
    const result = await this.log.append(event);
    this.jobs.set(event.id, event);
    this.statusMap.set(event.id, "pending");
    return result;
  }

  async appendMany(
    events: readonly WorkflowJob[]
  ): Promise<readonly EventLogAppendResult<WorkflowJob>[]> {
    const results: EventLogAppendResult<WorkflowJob>[] = [];
    for (const event of events) {
      results.push(await this.append(event));
    }
    return results;
  }

  async read(
    options?: EventLogReadOptions<WorkflowJob>
  ): Promise<readonly EventLogRecord<WorkflowJob>[]> {
    return this.log.read(options);
  }

  async *stream(
    options?: EventLogReadOptions<WorkflowJob>
  ): AsyncEventStream<EventLogRecord<WorkflowJob>> {
    yield* this.log.stream(options);
  }

  listPending(): readonly WorkflowJob[] {
    const pending: WorkflowJob[] = [];
    for (const [id, job] of this.jobs) {
      if (this.statusMap.get(id) === "pending") {
        pending.push(job);
      }
    }
    return pending;
  }

  markRunning(id: string): void {
    this.assertJobExists(id);
    this.statusMap.set(id, "running");
  }

  markCompleted(id: string, result: unknown): void {
    this.assertJobExists(id);
    this.statusMap.set(id, "completed");
    this.results.set(id, result);
  }

  markFailed(id: string, error: unknown): void {
    this.assertJobExists(id);
    this.statusMap.set(id, "failed");
    this.errors.set(id, error);
  }

  private assertJobExists(id: string): void {
    if (!this.jobs.has(id)) {
      throw new Error(`Job not found: ${id}`);
    }
  }
}

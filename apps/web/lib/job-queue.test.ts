import { beforeEach, describe, expect, it } from "vitest";

import { EventSourceKind } from "@control-plane/events";

import { JobQueue, type WorkflowJob, type WorkflowJobPayload } from "./job-queue";

function createMockJobPayload(overrides?: Partial<WorkflowJobPayload>): WorkflowJobPayload {
  return {
    status: "pending",
    webhookEvent: {
      id: "webhook-1",
      type: "webhook.received",
      occurredAt: new Date().toISOString(),
      source: {
        kind: "webhook",
        provider: "github",
        id: "webhook-1",
      },
      payload: {
        eventType: "pull_request",
        action: "opened",
        repositoryFullName: "owner/repo",
        senderLogin: "user",
        rawPayload: {},
      },
    },
    ruleName: "test-rule",
    actions: [],
    repoFullName: "owner/repo",
    repoConfig: { rules: [] },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockJob(id: string, payload?: Partial<WorkflowJobPayload>): WorkflowJob {
  return {
    id,
    type: "workflow.job_created",
    version: 1,
    occurredAt: new Date().toISOString(),
    source: { kind: EventSourceKind.System, id: "test" },
    payload: createMockJobPayload(payload),
  };
}

describe("JobQueue", () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue();
  });

  describe("append", () => {
    it("appends a job and returns a record with sequence and cursor", async () => {
      const job = createMockJob("job-1");
      const result = await queue.append(job);

      expect(result.record.sequence).toBe(1);
      expect(result.record.cursor).toBe("1");
      expect(result.record.event).toBe(job);
    });

    it("initially tracks appended job as pending", async () => {
      const job = createMockJob("job-1");
      await queue.append(job);

      const pending = queue.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe("job-1");
    });

    it("appends multiple jobs and tracks all as pending", async () => {
      await queue.append(createMockJob("job-1"));
      await queue.append(createMockJob("job-2"));
      await queue.append(createMockJob("job-3"));

      const pending = queue.listPending();
      expect(pending).toHaveLength(3);
    });
  });

  describe("listPending", () => {
    it("returns empty array when no jobs are queued", () => {
      expect(queue.listPending()).toEqual([]);
    });

    it("returns only pending jobs", async () => {
      await queue.append(createMockJob("job-1"));
      await queue.append(createMockJob("job-2"));
      queue.markRunning("job-1");

      const pending = queue.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe("job-2");
    });
  });

  describe("markRunning", () => {
    it("removes job from pending list", async () => {
      await queue.append(createMockJob("job-1"));
      queue.markRunning("job-1");

      expect(queue.listPending()).toHaveLength(0);
    });

    it("throws when marking unknown job as running", () => {
      expect(() => queue.markRunning("unknown")).toThrow("Job not found: unknown");
    });
  });

  describe("markCompleted", () => {
    it("removes job from pending list", async () => {
      await queue.append(createMockJob("job-1"));
      queue.markRunning("job-1");
      queue.markCompleted("job-1", { success: true });

      expect(queue.listPending()).toHaveLength(0);
    });

    it("throws when marking unknown job as completed", () => {
      expect(() => queue.markCompleted("unknown", {})).toThrow("Job not found: unknown");
    });
  });

  describe("markFailed", () => {
    it("removes job from pending list", async () => {
      await queue.append(createMockJob("job-1"));
      queue.markRunning("job-1");
      queue.markFailed("job-1", new Error("test error"));

      expect(queue.listPending()).toHaveLength(0);
    });

    it("throws when marking unknown job as failed", () => {
      expect(() => queue.markFailed("unknown", new Error("oops"))).toThrow(
        "Job not found: unknown"
      );
    });
  });

  describe("status transitions", () => {
    it("transitions pending -> running -> completed", async () => {
      await queue.append(createMockJob("job-1"));
      expect(queue.listPending()).toHaveLength(1);

      queue.markRunning("job-1");
      expect(queue.listPending()).toHaveLength(0);

      queue.markCompleted("job-1", { output: "done" });
      expect(queue.listPending()).toHaveLength(0);
    });

    it("transitions pending -> running -> failed", async () => {
      await queue.append(createMockJob("job-1"));
      expect(queue.listPending()).toHaveLength(1);

      queue.markRunning("job-1");
      expect(queue.listPending()).toHaveLength(0);

      queue.markFailed("job-1", new Error("boom"));
      expect(queue.listPending()).toHaveLength(0);
    });
  });

  describe("AppendOnlyEventLog delegation", () => {
    it("read returns all appended records", async () => {
      const job = createMockJob("job-1");
      await queue.append(job);

      const records = await queue.read();
      expect(records).toHaveLength(1);
      expect(records[0]!.event.id).toBe("job-1");
    });

    it("appendMany appends multiple events", async () => {
      const jobs = [createMockJob("job-1"), createMockJob("job-2")];
      const results = await queue.appendMany(jobs);

      expect(results).toHaveLength(2);
      expect(queue.listPending()).toHaveLength(2);
    });

    it("stream yields all records", async () => {
      await queue.append(createMockJob("job-1"));
      await queue.append(createMockJob("job-2"));

      const records: unknown[] = [];
      for await (const record of queue.stream()) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
    });
  });
});

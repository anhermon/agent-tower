import { describe, expect, it } from "vitest";

import {
  EVENT_LOG_START_CURSOR,
  EventLogReadDirection,
  InMemoryAppendOnlyEventLog,
} from "./event-log.js";
import { createMockEventEnvelope } from "./mock-stream.js";
import { ControlPlaneEventType, EventSourceKind } from "./types.js";

function makeLog() {
  return new InMemoryAppendOnlyEventLog();
}

function webhook(id: string) {
  return createMockEventEnvelope({
    id,
    type: ControlPlaneEventType.WebhookReceived,
    sourceKind: EventSourceKind.Webhook,
  });
}

function session(id: string) {
  return createMockEventEnvelope({
    id,
    type: ControlPlaneEventType.SessionStarted,
    sourceKind: EventSourceKind.Session,
  });
}

describe("InMemoryAppendOnlyEventLog", () => {
  describe("append", () => {
    it("given_an_event__when_appended__then_record_has_sequence_cursor_and_timestamp", async () => {
      const log = makeLog();
      const { record } = await log.append(webhook("e-1"));

      expect(record.sequence).toBe(1);
      expect(record.cursor).toBe("1");
      expect(record.event.id).toBe("e-1");
      expect(typeof record.appendedAt).toBe("string");
    });

    it("given_multiple_events__when_appended_sequentially__then_sequences_increment", async () => {
      const log = makeLog();
      const { record: r1 } = await log.append(webhook("e-1"));
      const { record: r2 } = await log.append(webhook("e-2"));
      const { record: r3 } = await log.append(webhook("e-3"));

      expect(r1.sequence).toBe(1);
      expect(r2.sequence).toBe(2);
      expect(r3.sequence).toBe(3);
    });
  });

  describe("appendMany", () => {
    it("given_a_batch_of_events__when_appended__then_all_records_are_stored_in_order", async () => {
      const log = makeLog();
      const results = await log.appendMany([webhook("a"), webhook("b"), webhook("c")]);

      expect(results).toHaveLength(3);
      expect(results[0]!.record.sequence).toBe(1);
      expect(results[2]!.record.sequence).toBe(3);
    });
  });

  describe("read", () => {
    it("given_no_options__when_read__then_returns_all_records_in_insertion_order", async () => {
      const log = makeLog();
      await log.appendMany([webhook("a"), webhook("b"), webhook("c")]);

      const records = await log.read();

      expect(records.map((r) => r.event.id)).toEqual(["a", "b", "c"]);
    });

    it("given_afterCursor__when_read_forward__then_returns_records_after_that_cursor", async () => {
      const log = makeLog();
      const results = await log.appendMany([webhook("a"), webhook("b"), webhook("c")]);
      const cursor = results[0]!.record.cursor;

      const records = await log.read({ afterCursor: cursor });

      expect(records.map((r) => r.event.id)).toEqual(["b", "c"]);
    });

    it("given_afterCursor__when_read_backward__then_returns_records_before_that_cursor", async () => {
      const log = makeLog();
      const results = await log.appendMany([webhook("a"), webhook("b"), webhook("c")]);
      const cursor = results[2]!.record.cursor;

      const records = await log.read({
        afterCursor: cursor,
        direction: EventLogReadDirection.Backward,
      });

      expect(records.map((r) => r.event.id)).toEqual(["b", "a"]);
    });

    it("given_a_limit__when_read__then_returns_at_most_limit_records", async () => {
      const log = makeLog();
      await log.appendMany([webhook("a"), webhook("b"), webhook("c"), webhook("d")]);

      const records = await log.read({ limit: 2 });

      expect(records).toHaveLength(2);
      expect(records.map((r) => r.event.id)).toEqual(["a", "b"]);
    });

    it("given_backward_direction__when_read__then_returns_records_in_reverse_order", async () => {
      const log = makeLog();
      await log.appendMany([webhook("a"), webhook("b"), webhook("c")]);

      const records = await log.read({ direction: EventLogReadDirection.Backward });

      expect(records.map((r) => r.event.id)).toEqual(["c", "b", "a"]);
    });

    it("given_a_type_filter__when_read__then_returns_only_matching_events", async () => {
      const log = makeLog();
      await log.appendMany([webhook("w1"), session("s1"), webhook("w2"), session("s2")]);

      const records = await log.read({
        filter: { types: [ControlPlaneEventType.WebhookReceived] },
      });

      expect(records.map((r) => r.event.id)).toEqual(["w1", "w2"]);
    });

    it("given_a_sourceKind_filter__when_read__then_returns_only_matching_events", async () => {
      const log = makeLog();
      await log.appendMany([webhook("w1"), session("s1"), webhook("w2")]);

      const records = await log.read({
        filter: { sourceKinds: [EventSourceKind.Session] },
      });

      expect(records.map((r) => r.event.id)).toEqual(["s1"]);
    });

    it("given_start_cursor_constant__when_read_forward__then_returns_all_records", async () => {
      const log = makeLog();
      await log.appendMany([webhook("a"), webhook("b")]);

      const records = await log.read({ afterCursor: EVENT_LOG_START_CURSOR });

      expect(records.map((r) => r.event.id)).toEqual(["a", "b"]);
    });

    it("given_empty_log__when_read__then_returns_empty_array", async () => {
      const log = makeLog();
      expect(await log.read()).toEqual([]);
    });
  });

  describe("stream", () => {
    it("given_events__when_streamed__then_yields_all_records_in_order", async () => {
      const log = makeLog();
      await log.appendMany([webhook("a"), webhook("b"), webhook("c")]);

      const yielded: string[] = [];
      for await (const record of log.stream()) {
        yielded.push(record.event.id);
      }

      expect(yielded).toEqual(["a", "b", "c"]);
    });

    it("given_a_filter__when_streamed__then_yields_only_matching_records", async () => {
      const log = makeLog();
      await log.appendMany([webhook("w1"), session("s1"), webhook("w2")]);

      const yielded: string[] = [];
      for await (const record of log.stream({
        filter: { sourceKinds: [EventSourceKind.Webhook] },
      })) {
        yielded.push(record.event.id);
      }

      expect(yielded).toEqual(["w1", "w2"]);
    });
  });

  describe("clear", () => {
    it("given_records__when_cleared__then_read_returns_empty", async () => {
      const log = makeLog();
      await log.appendMany([webhook("a"), webhook("b")]);

      log.clear();

      expect(await log.read()).toEqual([]);
    });

    it("given_cleared_log__when_new_events_appended__then_sequences_restart_from_1", async () => {
      const log = makeLog();
      await log.append(webhook("a"));
      log.clear();
      const { record } = await log.append(webhook("b"));

      expect(record.sequence).toBe(1);
    });
  });
});

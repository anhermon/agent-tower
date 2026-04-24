import { describe, expect, it } from "vitest";

import { computeTurnTimeline } from "./turn-timeline.js";

import type { ClaudeTranscriptEntry } from "../types.js";

const SID = "session-abc";

function assistantEntry(overrides: {
  readonly uuid?: string;
  readonly timestamp?: string;
  readonly content: readonly unknown[] | string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_read_input_tokens?: number;
    readonly cache_creation_input_tokens?: number;
  };
}): ClaudeTranscriptEntry {
  return {
    type: "assistant",
    sessionId: SID,
    uuid: overrides.uuid ?? "a-uuid",
    timestamp: overrides.timestamp ?? "2026-04-23T10:00:00.000Z",
    message: {
      role: "assistant",
      content: overrides.content,
      ...(overrides.usage ? { usage: overrides.usage } : {}),
    },
  } as unknown as ClaudeTranscriptEntry;
}

describe("computeTurnTimeline", () => {
  it("returns an empty timeline for an empty session", () => {
    const timeline = computeTurnTimeline([], { sessionId: SID });
    expect(timeline.sessionId).toBe(SID);
    expect(timeline.entries).toEqual([]);
  });

  it("infers sessionId from entries when not provided", () => {
    const timeline = computeTurnTimeline([
      assistantEntry({ content: [{ type: "text", text: "hello there" }] }),
    ]);
    expect(timeline.sessionId).toBe(SID);
  });

  it("captures tool names in order and computes cache hit rate", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantEntry({
        uuid: "turn-1",
        content: [
          { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/a" } },
          { type: "tool_use", id: "t2", name: "Grep", input: { pattern: "x" } },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 800,
          cache_creation_input_tokens: 200,
        },
      }),
    ];
    const t = computeTurnTimeline(entries, { sessionId: SID });
    expect(t.entries).toHaveLength(1);
    const e = t.entries[0]!;
    expect(e.role).toBe("assistant");
    expect(e.toolsUsed).toEqual(["Read", "Grep"]);
    expect(e.inputTokens).toBe(100);
    expect(e.cacheReadTokens).toBe(800);
    expect(e.cacheCreationTokens).toBe(200);
    expect(e.outputTokens).toBe(20);
    expect(e.cacheHitRate).toBeCloseTo(0.8, 5);
    expect(e.wastedTurn).toBe(false);
  });

  it("flags wastedTurn when assistant has no tool uses and short text", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantEntry({ uuid: "turn-1", content: [{ type: "text", text: "ok" }] }),
    ];
    const t = computeTurnTimeline(entries, { sessionId: SID });
    expect(t.entries[0]!.wastedTurn).toBe(true);
  });

  it("does not flag wastedTurn when assistant text is long enough", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantEntry({
        uuid: "turn-1",
        content: [{ type: "text", text: "This is a thoughtful response with enough characters." }],
      }),
    ];
    const t = computeTurnTimeline(entries, { sessionId: SID });
    expect(t.entries[0]!.wastedTurn).toBe(false);
  });

  it("does not flag wastedTurn when tool_use is present even without text", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantEntry({
        uuid: "turn-1",
        content: [{ type: "tool_use", id: "t", name: "Read", input: {} }],
      }),
    ];
    const t = computeTurnTimeline(entries, { sessionId: SID });
    expect(t.entries[0]!.wastedTurn).toBe(false);
  });

  it("counts tool_result failures on user turns", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        type: "user",
        sessionId: SID,
        timestamp: "2026-04-23T10:01:00.000Z",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", is_error: true, content: "boom" },
            { type: "tool_result", tool_use_id: "t2", is_error: false, content: "ok" },
            { type: "tool_result", tool_use_id: "t3", is_error: true, content: "boom" },
          ],
        },
      } as unknown as ClaudeTranscriptEntry,
    ];
    const t = computeTurnTimeline(entries, { sessionId: SID });
    expect(t.entries[0]!.role).toBe("user");
    expect(t.entries[0]!.toolFailures).toBe(2);
  });

  it("attaches durationMs from a matching turn_duration system event", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantEntry({
        uuid: "turn-dur",
        content: [{ type: "text", text: "a long enough response for sure" }],
      }),
      {
        type: "system",
        sessionId: SID,
        parentUuid: "turn-dur",
        timestamp: "2026-04-23T10:02:00.000Z",
        subtype: "turn_duration",
        durationMs: 12345,
      } as unknown as ClaudeTranscriptEntry,
    ];
    const t = computeTurnTimeline(entries, { sessionId: SID });
    expect(t.entries[0]!.durationMs).toBe(12345);
  });

  it("assigns monotonic turnIndex across user + assistant entries", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        type: "user",
        sessionId: SID,
        timestamp: "2026-04-23T10:00:00.000Z",
        message: { role: "user", content: "hi" },
      } as unknown as ClaudeTranscriptEntry,
      assistantEntry({
        uuid: "turn-a",
        content: [{ type: "text", text: "ack enough to pass threshold maybe" }],
      }),
      {
        type: "user",
        sessionId: SID,
        timestamp: "2026-04-23T10:01:00.000Z",
        message: { role: "user", content: "go" },
      } as unknown as ClaudeTranscriptEntry,
    ];
    const t = computeTurnTimeline(entries, { sessionId: SID });
    expect(t.entries.map((e) => e.turnIndex)).toEqual([0, 1, 2]);
    expect(t.entries.map((e) => e.role)).toEqual(["user", "assistant", "user"]);
  });
});

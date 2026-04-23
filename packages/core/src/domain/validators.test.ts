import { describe, expect, it } from "vitest";

import {
  assistantEntrySchema,
  parseTranscriptEntries,
  parseTranscriptEntry,
  resultEntrySchema,
  summaryEntrySchema,
  userEntrySchema,
} from "./validators.js";

describe("transcript entry validators", () => {
  // ── user entry ─────────────────────────────────────────────────────────────
  it("parses a valid user entry", () => {
    const raw = {
      type: "user",
      timestamp: "2025-01-15T10:00:00Z",
      uuid: "u-1",
      sessionId: "s-1",
      message: { role: "user", content: "hello" },
    };
    const result = userEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message.content).toBe("hello");
    }
  });

  // ── assistant entry with usage ─────────────────────────────────────────────
  it("parses a valid assistant entry with usage", () => {
    const raw = {
      type: "assistant",
      uuid: "a-1",
      message: {
        role: "assistant",
        model: "claude-3-opus-20240229",
        content: [{ type: "text", text: "hi" }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 80,
        },
      },
    };
    const result = assistantEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message.usage?.input_tokens).toBe(100);
    }
  });

  // ── passthrough preserves unknown fields ───────────────────────────────────
  it("preserves unknown fields via passthrough", () => {
    const raw = {
      type: "user",
      uuid: "u-2",
      message: { role: "user", content: "test", customField: 42 },
      extraTopLevel: true,
    };
    const result = userEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extraTopLevel).toBe(true);

      expect((result.data.message as any).customField).toBe(42);
    }
  });

  // ── invalid discriminator returns error ────────────────────────────────────
  it("returns error for unknown type in discriminated union", () => {
    const raw = { type: "unknown_type", uuid: "x-1" };
    const result = parseTranscriptEntry(raw);
    expect(result.success).toBe(false);
  });

  // ── missing required fields ────────────────────────────────────────────────
  it("returns error when required fields are missing", () => {
    // user entry without message
    const raw = { type: "user", uuid: "u-3" };
    const result = userEntrySchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  // ── summary entry ──────────────────────────────────────────────────────────
  it("parses a valid summary entry", () => {
    const raw = {
      type: "summary",
      uuid: "s-1",
      summary: "Session covered debugging a test failure.",
    };
    const result = summaryEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe("Session covered debugging a test failure.");
    }
  });

  // ── result entry ───────────────────────────────────────────────────────────
  it("parses a valid result entry", () => {
    const raw = {
      type: "result",
      uuid: "r-1",
      exitCode: 0,
      totalCostUsd: 0.12,
    };
    const result = resultEntrySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).exitCode).toBe(0);
    }
  });

  // ── batch parser ───────────────────────────────────────────────────────────
  it("batch-parses mixed entries", () => {
    const lines = [
      { type: "user", message: { role: "user", content: "hi" } },
      { type: "assistant", message: { role: "assistant", content: "hey" } },
      { type: "result" },
      { type: "bogus" },
    ];
    const results = parseTranscriptEntries(lines);
    expect(results).toHaveLength(4);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
    expect(results[2]!.success).toBe(true);
    expect(results[3]!.success).toBe(false);
  });
});

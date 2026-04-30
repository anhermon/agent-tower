import { describe, expect, it } from "vitest";

import { computeToolCostView } from "./tool-cost-view.js";

import type { ClaudeTranscriptEntry } from "../types.js";

const SID = "session-tool-cost";

function assistantTurn(
  tools: readonly string[],
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number },
  uuid = "a1"
): ClaudeTranscriptEntry {
  return {
    type: "assistant",
    sessionId: SID,
    uuid,
    timestamp: "2026-03-01T10:00:00.000Z",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "working." },
        ...tools.map((name, i) => ({
          type: "tool_use" as const,
          id: `${uuid}-tc${i}`,
          name,
          input: {},
        })),
      ],
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      },
    },
  } as unknown as ClaudeTranscriptEntry;
}

function userTurn(text: string): ClaudeTranscriptEntry {
  return {
    type: "user",
    sessionId: SID,
    uuid: "u1",
    timestamp: "2026-03-01T10:00:00.000Z",
    message: { role: "user", content: text },
  } as unknown as ClaudeTranscriptEntry;
}

describe("computeToolCostView", () => {
  it("returns empty view for a session with no assistant turns", () => {
    const got = computeToolCostView([], { sessionId: SID });
    expect(got.sessionId).toBe(SID);
    expect(got.tools).toEqual([]);
    expect(got.totalToolCalls).toBe(0);
    expect(got.totalAttributedOutputTokens).toBe(0);
  });

  it("returns empty view for a session with no tool calls", () => {
    const entries: ClaudeTranscriptEntry[] = [
      userTurn("hello"),
      {
        type: "assistant",
        sessionId: SID,
        uuid: "a1",
        timestamp: "2026-03-01T10:00:01.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello!" }],
          usage: {
            input_tokens: 50,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      } as unknown as ClaudeTranscriptEntry,
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    expect(got.tools).toEqual([]);
    expect(got.totalToolCalls).toBe(0);
  });

  it("tracks call counts per tool name", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(["Read"], { input_tokens: 100, output_tokens: 20 }, "a1"),
      assistantTurn(["Read"], { input_tokens: 120, output_tokens: 25 }, "a2"),
      assistantTurn(["Bash"], { input_tokens: 200, output_tokens: 30 }, "a3"),
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    const read = got.tools.find((t) => t.toolName === "Read");
    const bash = got.tools.find((t) => t.toolName === "Bash");
    expect(read?.callCount).toBe(2);
    expect(bash?.callCount).toBe(1);
  });

  it("accumulates outputTokensFromTurns per tool", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(["Read"], { input_tokens: 100, output_tokens: 20 }, "a1"),
      assistantTurn(["Read"], { input_tokens: 120, output_tokens: 25 }, "a2"),
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    const read = got.tools.find((t) => t.toolName === "Read");
    expect(read?.outputTokensFromTurns).toBe(45); // 20 + 25
  });

  it("accumulates inputTokensFromTurns per tool", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(["Bash"], { input_tokens: 300, output_tokens: 50 }, "a1"),
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    const bash = got.tools.find((t) => t.toolName === "Bash");
    expect(bash?.inputTokensFromTurns).toBe(300);
  });

  it("credits all tools on a multi-tool turn with the turn's full token counts", () => {
    // Turn a1 uses both Read and Edit — each gets the full turn token count.
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(["Read", "Edit"], { input_tokens: 500, output_tokens: 60 }, "a1"),
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    const read = got.tools.find((t) => t.toolName === "Read");
    const edit = got.tools.find((t) => t.toolName === "Edit");
    expect(read?.outputTokensFromTurns).toBe(60);
    expect(edit?.outputTokensFromTurns).toBe(60);
  });

  it("counts multiple calls to the same tool in one turn as separate calls", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(["Read", "Read", "Read"], { input_tokens: 100, output_tokens: 20 }, "a1"),
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    const read = got.tools.find((t) => t.toolName === "Read");
    expect(read?.callCount).toBe(3);
    // Turn is only credited once for the shared token cost.
    expect(read?.outputTokensFromTurns).toBe(20);
  });

  it("sorts by outputTokensFromTurns descending", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(["Read"], { input_tokens: 100, output_tokens: 10 }, "a1"),
      assistantTurn(["Bash"], { input_tokens: 200, output_tokens: 50 }, "a2"),
      assistantTurn(["Edit"], { input_tokens: 150, output_tokens: 30 }, "a3"),
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    expect(got.tools[0]!.toolName).toBe("Bash");
    expect(got.tools[1]!.toolName).toBe("Edit");
    expect(got.tools[2]!.toolName).toBe("Read");
  });

  it("totalToolCalls is sum of all call counts", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(["Read", "Read"], { input_tokens: 100, output_tokens: 20 }, "a1"),
      assistantTurn(["Bash"], { input_tokens: 200, output_tokens: 30 }, "a2"),
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    expect(got.totalToolCalls).toBe(3); // 2 + 1
  });

  it("accumulates cacheReadTokensFromTurns", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(
        ["Read"],
        { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 800 },
        "a1"
      ),
    ];
    const got = computeToolCostView(entries, { sessionId: SID });
    const read = got.tools.find((t) => t.toolName === "Read");
    expect(read?.cacheReadTokensFromTurns).toBe(800);
  });

  it("reads sessionId from first entry when not provided in options", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn(["Read"], { input_tokens: 100, output_tokens: 10 }, "a1"),
    ];
    const got = computeToolCostView(entries);
    expect(got.sessionId).toBe(SID);
  });
});

import { describe, expect, it } from "vitest";

import { estimateCostFromUsage } from "@control-plane/core";
import { claudeCodeFixture } from "@control-plane/testing/fixtures/claude-code";

import { foldReplay } from "./replay.js";

import type { ClaudeTranscriptEntry } from "../types.js";

function entries(name: Parameters<typeof claudeCodeFixture>[0]): readonly ClaudeTranscriptEntry[] {
  return claudeCodeFixture(name).entries as readonly ClaudeTranscriptEntry[];
}

describe("foldReplay", () => {
  it("given_a_single_turn_fixture__when_folded__then_produces_one_user_and_one_assistant_turn_with_cost", () => {
    const replay = foldReplay(entries("single-turn"));
    expect(replay.sessionId).toBe("fx-single-001");
    expect(replay.turns).toHaveLength(2);
    const assistant = replay.turns[1]!;
    expect(assistant.type).toBe("assistant");
    expect(assistant.model).toBe("claude-sonnet-4-6");
    expect(assistant.turnDurationMs).toBe(1100);
    expect(assistant.estimatedCostUsd).toBeCloseTo(
      estimateCostFromUsage("claude-sonnet-4-6", {
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      }),
      10
    );
  });

  it("given_the_multi_turn_fixture__when_folded__then_tool_calls_and_tool_results_align", () => {
    const replay = foldReplay(entries("multi-turn"));
    // 3 user + 3 assistant
    expect(replay.turns.filter((t) => t.type === "user")).toHaveLength(3);
    expect(replay.turns.filter((t) => t.type === "assistant")).toHaveLength(3);
    const firstAssistant = replay.turns.find(
      (t) => t.type === "assistant" && (t.toolCalls?.length ?? 0) > 0
    );
    expect(firstAssistant?.toolCalls?.[0]?.name).toBe("Read");
    const toolResultTurn = replay.turns.find(
      (t) => t.type === "user" && (t.toolResults?.length ?? 0) > 0
    );
    expect(toolResultTurn?.toolResults?.[0]?.toolUseId).toBe("tc-1");
    expect(toolResultTurn?.toolResults?.[0]?.isError).toBe(false);
  });

  it("given_the_compaction_fixture__when_folded__then_emits_a_compaction_event_with_trigger_and_pre_tokens", () => {
    const replay = foldReplay(entries("compaction"));
    expect(replay.compactions).toHaveLength(1);
    expect(replay.compactions[0]).toMatchObject({
      trigger: "auto",
      preTokens: 155000,
    });
    expect(replay.summaries).toHaveLength(1);
    expect(replay.compactions[0]!.summary).toBe(replay.summaries[0]!.summary);
  });

  it("given_the_thinking_fixture__when_folded__then_has_thinking_is_true_and_thinking_text_is_populated", () => {
    const replay = foldReplay(entries("thinking"));
    const assistant = replay.turns.find((t) => t.type === "assistant")!;
    expect(assistant.hasThinking).toBe(true);
    expect(assistant.thinkingText).toContain("Two plus two");
  });

  it("given_a_long_tool_result__when_folded__then_preview_is_capped_at_the_limit", () => {
    const large = "x".repeat(5000);
    const custom: ClaudeTranscriptEntry[] = [
      {
        type: "user",
        sessionId: "fx-trim",
        uuid: "u1",
        timestamp: "2026-03-01T00:00:00.000Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tc1", content: large, is_error: false }],
        },
      } as unknown as ClaudeTranscriptEntry,
    ];
    const replay = foldReplay(custom, { toolResultPreviewLimit: 200 });
    expect(replay.turns[0]?.toolResults?.[0]?.content.length).toBe(200);
  });

  it("given_sum_of_per_turn_costs__when_computed__then_equals_totalCostUsd", () => {
    const replay = foldReplay(entries("multi-turn"));
    const sum = replay.turns.reduce((acc, t) => acc + (t.estimatedCostUsd ?? 0), 0);
    expect(sum).toBeCloseTo(replay.totalCostUsd, 10);
  });
});

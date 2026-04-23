import { claudeCodeFixture } from "@control-plane/testing/fixtures/claude-code";
import { describe, expect, it } from "vitest";
import type { ClaudeTranscriptEntry } from "../types.js";
import { foldSessionSummary } from "./session-summary.js";

function entriesOf(
  name: Parameters<typeof claudeCodeFixture>[0]
): readonly ClaudeTranscriptEntry[] {
  return claudeCodeFixture(name).entries as readonly ClaudeTranscriptEntry[];
}

describe("foldSessionSummary", () => {
  it("given_a_single_turn_fixture__when_folding__then_counts_messages_and_tokens_correctly", () => {
    const summary = foldSessionSummary(entriesOf("single-turn"));
    expect(summary.sessionId).toBe("fx-single-001");
    expect(summary.userMessageCount).toBe(1);
    expect(summary.assistantMessageCount).toBe(1);
    expect(summary.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
    expect(summary.model).toBe("claude-sonnet-4-6");
    expect(summary.flags.hasCompaction).toBe(false);
    expect(summary.flags.hasThinking).toBe(false);
  });

  it("given_the_multi_turn_fixture__when_folding__then_tool_counts_and_cache_hits_aggregate", () => {
    const summary = foldSessionSummary(entriesOf("multi-turn"));
    expect(summary.toolCounts).toEqual({ Read: 1 });
    expect(summary.usage.cacheReadInputTokens).toBe(500 + 700 + 900);
    expect(summary.usage.cacheCreationInputTokens).toBe(200);
    expect(summary.estimatedCostUsd).toBeGreaterThan(0);
    expect(summary.cacheEfficiency.hitRate).toBeGreaterThan(0);
  });

  it("given_the_compaction_fixture__when_folding__then_compaction_flag_and_event_are_populated", () => {
    const summary = foldSessionSummary(entriesOf("compaction"));
    expect(summary.flags.hasCompaction).toBe(true);
    expect(summary.compactions).toHaveLength(1);
    expect(summary.compactions[0]).toMatchObject({
      sessionId: "fx-compact-001",
      trigger: "auto",
      preTokens: 155000,
    });
  });

  it("given_the_thinking_fixture__when_folding__then_thinking_flag_is_set", () => {
    const summary = foldSessionSummary(entriesOf("thinking"));
    expect(summary.flags.hasThinking).toBe(true);
  });

  it("given_the_mcp_tool_fixture__when_folding__then_mcp_flag_is_set_and_tool_is_counted_with_full_name", () => {
    const summary = foldSessionSummary(entriesOf("mcp-tool"));
    expect(summary.flags.usesMcp).toBe(true);
    expect(summary.toolCounts.mcp__linear__list_issues).toBe(1);
  });

  it("given_the_task_agent_fixture__when_folding__then_task_agent_flag_is_set", () => {
    const summary = foldSessionSummary(entriesOf("task-agent"));
    expect(summary.flags.usesTaskAgent).toBe(true);
    expect(summary.toolCounts.Task).toBe(1);
  });

  it("given_the_web_search_fixture__when_folding__then_web_search_and_fetch_flags_are_set", () => {
    const summary = foldSessionSummary(entriesOf("web-search"));
    expect(summary.flags.usesWebSearch).toBe(true);
    expect(summary.flags.usesWebFetch).toBe(true);
    expect(summary.toolCounts).toEqual({ WebSearch: 1, WebFetch: 1 });
  });

  it("given_include_turns_option__when_folding__then_returns_per_assistant_turn_rows_with_cost_and_duration", () => {
    const summary = foldSessionSummary(entriesOf("single-turn"), {
      includeTurns: true,
    });
    expect(summary.turns).toBeDefined();
    const assistantTurn = summary.turns!.find((t) => t.turnId === "a1");
    expect(assistantTurn?.model).toBe("claude-sonnet-4-6");
    expect(assistantTurn?.turnDurationMs).toBe(1100);
    expect(assistantTurn?.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("given_empty_entries__when_folding__then_returns_a_zero_summary_without_throwing", () => {
    const summary = foldSessionSummary([]);
    expect(summary.sessionId).toBe("unknown");
    expect(summary.userMessageCount).toBe(0);
    expect(summary.assistantMessageCount).toBe(0);
    expect(summary.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
    expect(summary.estimatedCostUsd).toBe(0);
    expect(summary.model).toBeNull();
  });
});

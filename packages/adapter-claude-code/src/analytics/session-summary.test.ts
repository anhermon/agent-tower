import { describe, expect, it } from "vitest";

import { claudeCodeFixture } from "@control-plane/testing/fixtures/claude-code";

import { foldSessionSummary } from "./session-summary.js";

import type { ClaudeTranscriptEntry } from "../types.js";

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

// ─── Waste signals ────────────────────────────────────────────────────────────

function assistantTurn(
  uuid: string,
  parentUuid: string | null,
  toolUses: readonly { id: string; name: string; input?: Record<string, unknown> }[] = [],
  usage: Record<string, number> = { input_tokens: 10, output_tokens: 2 }
): ClaudeTranscriptEntry {
  return {
    type: "assistant",
    sessionId: "fx-waste",
    uuid,
    parentUuid,
    timestamp: "2026-04-23T10:00:00.000Z",
    message: {
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: toolUses.map((t) => ({
        type: "tool_use",
        id: t.id,
        name: t.name,
        input: t.input ?? {},
      })),
      usage,
    },
  } as unknown as ClaudeTranscriptEntry;
}

function userToolResult(
  uuid: string,
  parentUuid: string,
  results: readonly { toolUseId: string; isError?: boolean }[]
): ClaudeTranscriptEntry {
  return {
    type: "user",
    sessionId: "fx-waste",
    uuid,
    parentUuid,
    timestamp: "2026-04-23T10:00:01.000Z",
    message: {
      role: "user",
      content: results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.toolUseId,
        is_error: r.isError === true,
        content: "ok",
      })),
    },
  } as unknown as ClaudeTranscriptEntry;
}

describe("foldSessionSummary.waste", () => {
  it("given_mixed_single_and_double_tool_turns__when_folded__then_sequentialToolTurnPct_is_half", () => {
    // 4 assistant turns with tools: 2 single-tool, 2 two-tool.
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn("a1", null, [{ id: "t1", name: "Read", input: { file_path: "/x/a.ts" } }]),
      assistantTurn("a2", "a1", [
        { id: "t2", name: "Read", input: { file_path: "/x/b.ts" } },
        { id: "t3", name: "Grep" },
      ]),
      assistantTurn("a3", "a2", [{ id: "t4", name: "Bash" }]),
      assistantTurn("a4", "a3", [
        { id: "t5", name: "Read", input: { file_path: "/x/c.ts" } },
        { id: "t6", name: "Edit" },
      ]),
    ];
    const summary = foldSessionSummary(entries);
    expect(summary.waste).toBeDefined();
    expect(summary.waste!.sequentialToolTurnPct).toBeCloseTo(0.5, 10);
    expect(summary.waste!.totalToolUseBlocks).toBe(6);
    expect(summary.waste!.distinctToolCount).toBe(4); // Read, Grep, Bash, Edit
  });

  it("given_a_file_read_four_times__when_folded__then_repeatReads_contains_only_that_entry", () => {
    // Read /same.ts four times, /other.ts twice (< 3 => excluded).
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn("a1", null, [{ id: "t1", name: "Read", input: { file_path: "/same.ts" } }]),
      assistantTurn("a2", "a1", [{ id: "t2", name: "Read", input: { file_path: "/same.ts" } }]),
      assistantTurn("a3", "a2", [{ id: "t3", name: "Read", input: { file_path: "/same.ts" } }]),
      assistantTurn("a4", "a3", [{ id: "t4", name: "Read", input: { file_path: "/same.ts" } }]),
      assistantTurn("a5", "a4", [{ id: "t5", name: "Read", input: { file_path: "/other.ts" } }]),
      assistantTurn("a6", "a5", [{ id: "t6", name: "Read", input: { file_path: "/other.ts" } }]),
    ];
    const summary = foldSessionSummary(entries);
    expect(summary.waste!.repeatReads).toEqual([{ filePath: "/same.ts", count: 4 }]);
  });

  it("given_five_tool_results_with_one_error__when_folded__then_toolFailurePct_is_point_two", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn("a1", null, [
        { id: "t1", name: "Bash" },
        { id: "t2", name: "Bash" },
        { id: "t3", name: "Bash" },
        { id: "t4", name: "Bash" },
        { id: "t5", name: "Bash" },
      ]),
      userToolResult("u1", "a1", [
        { toolUseId: "t1", isError: false },
        { toolUseId: "t2", isError: false },
        { toolUseId: "t3", isError: true },
        { toolUseId: "t4", isError: false },
        { toolUseId: "t5", isError: false },
      ]),
    ];
    const sink = new Map<string, number>();
    const summary = foldSessionSummary(entries, { toolErrorSink: sink });
    expect(summary.waste!.totalToolResults).toBe(5);
    expect(summary.waste!.toolFailurePct).toBeCloseTo(0.2, 10);
    expect(sink.get("Bash")).toBe(1);
  });

  it("given_peak_above_threshold_and_no_compaction__when_folded__then_bloatWithoutCompaction_is_true", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn("a1", null, [], {
        input_tokens: 40_000,
        output_tokens: 100,
        cache_read_input_tokens: 120_000,
        cache_creation_input_tokens: 0,
      }),
    ];
    const summary = foldSessionSummary(entries);
    expect(summary.waste!.peakInputTokensBetweenCompactions).toBe(160_000);
    expect(summary.waste!.bloatWithoutCompaction).toBe(true);
  });

  it("given_cache_creation_and_read_tokens__when_folded__then_cacheThrashRatio_uses_usage_totals", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantTurn("a1", null, [], {
        input_tokens: 10,
        output_tokens: 1,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 800,
      }),
    ];
    const summary = foldSessionSummary(entries);
    // 200 / (200 + 800) = 0.2
    expect(summary.waste!.cacheThrashRatio).toBeCloseTo(0.2, 10);
  });

  it("given_an_mcp_fixture__when_folded__then_mcpToolCallPct_reflects_the_mcp_share", () => {
    const summary = foldSessionSummary(entriesOf("mcp-tool"));
    // mcp-tool fixture has a single tool_use — all of them MCP.
    expect(summary.waste!.mcpToolCallPct).toBe(1);
    expect(summary.waste!.totalToolUseBlocks).toBe(1);
  });
});

import { describe, expect, it } from "vitest";

import { claudeCodeFixture } from "@control-plane/testing/fixtures/claude-code";


import { foldSessionSummary } from "./session-summary.js";
import { foldToolAnalytics } from "./tools.js";

import type { ClaudeTranscriptEntry } from "../types.js";

function entries(name: Parameters<typeof claudeCodeFixture>[0]): readonly ClaudeTranscriptEntry[] {
  return claudeCodeFixture(name).entries as readonly ClaudeTranscriptEntry[];
}

describe("foldToolAnalytics", () => {
  it("given_a_mix_of_fixtures__when_folded__then_top_tool_is_first_and_categories_match", () => {
    const names = ["single-turn", "multi-turn", "mcp-tool", "task-agent", "web-search"] as const;
    const sessions = names.map((n) => foldSessionSummary(entries(n)));
    const analytics = foldToolAnalytics(sessions);

    expect(analytics.totalToolCalls).toBeGreaterThan(0);
    expect(analytics.tools.length).toBeGreaterThan(0);
    const names_seen = analytics.tools.map((t) => t.name);
    expect(names_seen).toEqual(expect.arrayContaining(["Read", "Task", "WebSearch", "WebFetch"]));
    expect(analytics.tools.find((t) => t.name === "Read")?.category).toBe("file-io");
    expect(analytics.tools.find((t) => t.name === "Task")?.category).toBe("agent");
    expect(analytics.tools.find((t) => t.name === "WebSearch")?.category).toBe("web");
  });

  it("given_an_mcp_fixture__when_folded__then_mcp_server_summary_groups_under_its_server", () => {
    const sessions = [foldSessionSummary(entries("mcp-tool"))];
    const analytics = foldToolAnalytics(sessions);
    expect(analytics.mcpServers).toHaveLength(1);
    const linear = analytics.mcpServers[0]!;
    expect(linear.serverName).toBe("linear");
    expect(linear.tools).toEqual([{ name: "list_issues", calls: 1 }]);
    expect(linear.sessionCount).toBe(1);
  });

  it("given_sessions_with_flags__when_folded__then_feature_adoption_percentages_are_correct", () => {
    const sessions = [
      foldSessionSummary(entries("compaction")),
      foldSessionSummary(entries("thinking")),
      foldSessionSummary(entries("mcp-tool")),
      foldSessionSummary(entries("task-agent")),
    ];
    const analytics = foldToolAnalytics(sessions);
    expect(analytics.featureAdoption.compaction!.sessions).toBe(1);
    expect(analytics.featureAdoption.compaction!.pct).toBeCloseTo(0.25, 10);
    expect(analytics.featureAdoption.thinking!.sessions).toBe(1);
    expect(analytics.featureAdoption.mcp!.sessions).toBe(1);
    expect(analytics.featureAdoption.taskAgent!.sessions).toBe(1);
  });

  it("given_versions_and_branches__when_folded__then_records_are_sorted_recency_first", () => {
    const sessions = [
      foldSessionSummary(entries("single-turn")),
      foldSessionSummary(entries("multi-turn")),
    ];
    const analytics = foldToolAnalytics(sessions);
    expect(analytics.versions.length).toBeGreaterThan(0);
    expect(analytics.branches).toEqual(expect.arrayContaining([{ branch: "main", turnCount: 1 }]));
  });

  it("given_no_sessions__when_folded__then_returns_empty_but_well_shaped_analytics", () => {
    const analytics = foldToolAnalytics([]);
    expect(analytics.tools).toEqual([]);
    expect(analytics.mcpServers).toEqual([]);
    expect(analytics.totalToolCalls).toBe(0);
    // Adoption map still populated with zeros.
    expect(analytics.featureAdoption.compaction).toEqual({ sessions: 0, pct: 0 });
  });
});

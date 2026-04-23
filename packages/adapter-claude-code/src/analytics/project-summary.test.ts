import { describe, expect, it } from "vitest";

import { claudeCodeFixture } from "@control-plane/testing/fixtures/claude-code";

import { foldProjectSummaries, foldProjectSummary } from "./project-summary.js";
import { foldSessionSummary } from "./session-summary.js";

import type { ClaudeTranscriptEntry } from "../types.js";

function entries(name: Parameters<typeof claudeCodeFixture>[0]): readonly ClaudeTranscriptEntry[] {
  return claudeCodeFixture(name).entries as readonly ClaudeTranscriptEntry[];
}

describe("foldProjectSummary", () => {
  it("given_two_sessions_in_the_same_project__when_folding__then_aggregates_tokens_cost_messages_and_flags", () => {
    const sessionA = foldSessionSummary(entries("multi-turn"));
    const sessionB = foldSessionSummary(entries("web-search"));
    const project = foldProjectSummary({
      id: "proj-alpha",
      sessions: [sessionA, sessionB],
      displayPath: "/Users/demo/workspace/alpha",
    });

    expect(project.sessionCount).toBe(2);
    expect(project.totalMessages).toBe(
      sessionA.userMessageCount +
        sessionA.assistantMessageCount +
        sessionB.userMessageCount +
        sessionB.assistantMessageCount
    );
    expect(project.estimatedCostUsd).toBeCloseTo(
      sessionA.estimatedCostUsd + sessionB.estimatedCostUsd,
      10
    );
    expect(project.flags.usesWebSearch).toBe(true);
    expect(project.flags.usesWebFetch).toBe(true);
    expect(project.toolCounts.WebSearch).toBe(1);
    expect(project.toolCounts.Read).toBe(1);
    expect(project.branches).toContain("feature/x");
    expect(project.displayName).toBe("alpha");
    expect(project.displayPath).toBe("/Users/demo/workspace/alpha");
  });

  it("given_grouping_by_cwd__when_folding_all__then_returns_one_project_per_distinct_cwd_sorted_by_recency", () => {
    const all = [
      foldSessionSummary(entries("single-turn")),
      foldSessionSummary(entries("multi-turn")),
      foldSessionSummary(entries("web-search")),
    ];
    const projects = foldProjectSummaries(all, (s) => s.cwd ?? "unknown");
    expect(projects.map((p) => p.displayPath).sort()).toEqual(
      [
        "/Users/demo/workspace/alpha",
        "/Users/demo/workspace/beta",
        "/Users/demo/workspace/eta",
      ].sort()
    );
    // Sorted newest first
    const lastActiveSorted = [...projects].every((p, i, arr) => {
      if (i === 0) return true;
      return (arr[i - 1]!.lastActive ?? "") >= (p.lastActive ?? "");
    });
    expect(lastActiveSorted).toBe(true);
  });

  it("given_no_sessions__when_folding__then_returns_empty_shaped_summary", () => {
    const project = foldProjectSummary({ id: "empty", sessions: [] });
    expect(project.sessionCount).toBe(0);
    expect(project.totalMessages).toBe(0);
    expect(project.estimatedCostUsd).toBe(0);
    expect(project.flags.hasCompaction).toBe(false);
  });

  it("given_a_slug_like_id__when_no_display_path_provided__then_decodes_the_slug_to_a_readable_path", () => {
    const project = foldProjectSummary({ id: "-Users-you-workspace-zeta", sessions: [] });
    expect(project.displayPath).toBe("/Users/you/workspace/zeta");
    expect(project.displayName).toBe("zeta");
  });
});

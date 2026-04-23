import { describe, expect, it } from "vitest";

import { categorizeTool, isMcpTool, parseMcpTool, type ToolCategory } from "./tools.js";

// Exhaustive mapping of every tool name we expect to see in Claude Code
// transcripts to its canonical category. Adding a new tool means adding a row
// here — the test guarantees categorization stays deterministic.
const EXPECTED: readonly (readonly [string, ToolCategory])[] = [
  // file-io
  ["Read", "file-io"],
  ["Write", "file-io"],
  ["Edit", "file-io"],
  ["MultiEdit", "file-io"],
  ["Glob", "file-io"],
  ["Grep", "file-io"],
  ["NotebookEdit", "file-io"],
  ["NotebookRead", "file-io"],
  ["LS", "file-io"],
  // shell
  ["Bash", "shell"],
  ["BashOutput", "shell"],
  ["KillBash", "shell"],
  ["KillShell", "shell"],
  // agent
  ["Task", "agent"],
  ["TaskCreate", "agent"],
  ["TaskUpdate", "agent"],
  ["TaskList", "agent"],
  ["TaskOutput", "agent"],
  ["TaskStop", "agent"],
  ["TaskGet", "agent"],
  // web
  ["WebSearch", "web"],
  ["WebFetch", "web"],
  // planning
  ["EnterPlanMode", "planning"],
  ["ExitPlanMode", "planning"],
  ["AskUserQuestion", "planning"],
  // todo
  ["TodoWrite", "todo"],
  // skill
  ["Skill", "skill"],
  ["ToolSearch", "skill"],
  ["ListMcpResourcesTool", "skill"],
  ["ReadMcpResourceTool", "skill"],
];

describe("categorizeTool", () => {
  it.each(EXPECTED)("given_tool_name_%s__when_categorized__then_returns_%s", (name, expected) => {
    expect(categorizeTool(name)).toBe(expected);
  });

  it("given_an_unknown_tool__when_categorized__then_falls_back_to_other", () => {
    expect(categorizeTool("MysterySprocket")).toBe("other");
    expect(categorizeTool("")).toBe("other");
  });

  it("given_an_mcp_prefixed_name__when_categorized__then_always_returns_mcp", () => {
    expect(categorizeTool("mcp__github__list_issues")).toBe("mcp");
    expect(categorizeTool("mcp__slack__send_message")).toBe("mcp");
  });
});

describe("isMcpTool", () => {
  it("given_an_mcp_name__when_checked__then_returns_true", () => {
    expect(isMcpTool("mcp__server__tool")).toBe(true);
  });

  it("given_a_non_mcp_name__when_checked__then_returns_false", () => {
    expect(isMcpTool("Read")).toBe(false);
    expect(isMcpTool("")).toBe(false);
    expect(isMcpTool("mcp_short")).toBe(false); // only single underscore
  });
});

describe("parseMcpTool", () => {
  it("given_a_valid_mcp_name__when_parsed__then_returns_server_and_tool_parts", () => {
    expect(parseMcpTool("mcp__github__list_issues")).toEqual({
      server: "github",
      tool: "list_issues",
    });
  });

  it("given_a_tool_name_with_double_underscores__when_parsed__then_preserves_the_inner_double_underscore", () => {
    expect(parseMcpTool("mcp__linear__issues__list")).toEqual({
      server: "linear",
      tool: "issues__list",
    });
  });

  it("given_a_non_mcp_name_or_missing_parts__when_parsed__then_returns_null", () => {
    expect(parseMcpTool("Read")).toBeNull();
    expect(parseMcpTool("mcp__only_server")).toBeNull();
    expect(parseMcpTool("mcp____empty_server")).toBeNull();
    expect(parseMcpTool("")).toBeNull();
  });
});

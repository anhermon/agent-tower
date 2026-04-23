import { describe, expect, it } from "vitest";

import { detectSkillFromBlock, detectSkillsFromEntry } from "./detect.js";

import type { ClaudeTranscriptEntry } from "../types.js";

describe("detectSkillFromBlock", () => {
  it("returns the trimmed skill key for a Skill tool_use block", () => {
    const got = detectSkillFromBlock({
      type: "tool_use",
      id: "id-1",
      name: "Skill",
      input: { skill: "  testing  " },
    });
    expect(got).toBe("testing");
  });

  it("returns null for non-tool-use blocks", () => {
    expect(detectSkillFromBlock({ type: "text", text: "/testing" })).toBeNull();
    expect(detectSkillFromBlock({ type: "thinking", thinking: "think about testing" })).toBeNull();
  });

  it("returns null for non-Skill tool_use blocks", () => {
    expect(
      detectSkillFromBlock({ type: "tool_use", id: "x", name: "Task", input: { skill: "testing" } })
    ).toBeNull();
  });

  it("returns null when input.skill is missing, empty, or non-string", () => {
    expect(
      detectSkillFromBlock({ type: "tool_use", id: "x", name: "Skill", input: {} })
    ).toBeNull();
    expect(
      detectSkillFromBlock({ type: "tool_use", id: "x", name: "Skill", input: { skill: "" } })
    ).toBeNull();
    expect(
      detectSkillFromBlock({ type: "tool_use", id: "x", name: "Skill", input: { skill: "   " } })
    ).toBeNull();
    expect(
      detectSkillFromBlock({
        type: "tool_use",
        id: "x",
        name: "Skill",
        input: { skill: 42 as unknown as string },
      })
    ).toBeNull();
  });

  it("tolerates null/undefined", () => {
    expect(detectSkillFromBlock(null)).toBeNull();
    expect(detectSkillFromBlock(undefined)).toBeNull();
  });
});

describe("detectSkillsFromEntry", () => {
  it("returns all skill keys from assistant content", () => {
    const entry: ClaudeTranscriptEntry = {
      type: "assistant",
      sessionId: "s",
      timestamp: "2026-04-23T00:00:00.000Z",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "picking skills" },
          { type: "tool_use", id: "a", name: "Skill", input: { skill: "testing" } },
          { type: "tool_use", id: "b", name: "Skill", input: { skill: "commit" } },
          { type: "tool_use", id: "c", name: "Read", input: { file_path: "/x" } },
        ],
      },
    } as ClaudeTranscriptEntry;
    expect(detectSkillsFromEntry(entry)).toEqual(["testing", "commit"]);
  });

  it("returns empty for user and system entries", () => {
    const user: ClaudeTranscriptEntry = {
      type: "user",
      sessionId: "s",
      message: { role: "user", content: "<command-name>testing</command-name>" },
    } as ClaudeTranscriptEntry;
    expect(detectSkillsFromEntry(user)).toEqual([]);
  });

  it("returns empty when content is a string", () => {
    const entry: ClaudeTranscriptEntry = {
      type: "assistant",
      sessionId: "s",
      message: { role: "assistant", content: "just prose" },
    } as ClaudeTranscriptEntry;
    expect(detectSkillsFromEntry(entry)).toEqual([]);
  });
});

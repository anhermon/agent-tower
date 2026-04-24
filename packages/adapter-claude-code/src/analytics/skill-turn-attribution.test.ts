import { describe, expect, it } from "vitest";

import { computeSkillTurnAttribution } from "./skill-turn-attribution.js";

import type { ClaudeTranscriptEntry } from "../types.js";

const SID = "session-skills";

function assistantWithSkills(skills: readonly string[], uuid = "u"): ClaudeTranscriptEntry {
  return {
    type: "assistant",
    sessionId: SID,
    uuid,
    timestamp: "2026-04-23T00:00:00.000Z",
    message: {
      role: "assistant",
      content: skills.map((s, i) => ({
        type: "tool_use" as const,
        id: `${uuid}-${i}`,
        name: "Skill",
        input: { skill: s },
      })),
    },
  } as unknown as ClaudeTranscriptEntry;
}

function userText(text: string): ClaudeTranscriptEntry {
  return {
    type: "user",
    sessionId: SID,
    timestamp: "2026-04-23T00:00:00.000Z",
    message: { role: "user", content: text },
  } as unknown as ClaudeTranscriptEntry;
}

describe("computeSkillTurnAttribution", () => {
  it("returns an empty attribution for an empty session", () => {
    const got = computeSkillTurnAttribution([], { sessionId: SID });
    expect(got.sessionId).toBe(SID);
    expect(got.entries).toEqual([]);
  });

  it("flags the turn where each skill is invoked and accumulates forward", () => {
    const entries: ClaudeTranscriptEntry[] = [
      userText("please run /testing"),
      assistantWithSkills(["testing"], "a1"),
      userText("now /commit"),
      assistantWithSkills(["commit"], "a2"),
      userText("idle"),
    ];
    const got = computeSkillTurnAttribution(entries, { sessionId: SID });
    expect(got.entries).toHaveLength(5);
    expect(got.entries[0]!.skillsActivatedOnThisTurn).toEqual([]);
    expect(got.entries[0]!.skillsActiveCumulative).toEqual([]);
    expect(got.entries[1]!.skillsActivatedOnThisTurn).toEqual(["testing"]);
    expect(got.entries[1]!.skillsActiveCumulative).toEqual(["testing"]);
    expect(got.entries[3]!.skillsActivatedOnThisTurn).toEqual(["commit"]);
    expect(got.entries[3]!.skillsActiveCumulative).toEqual(["commit", "testing"]);
    expect(got.entries[4]!.skillsActivatedOnThisTurn).toEqual([]);
    expect(got.entries[4]!.skillsActiveCumulative).toEqual(["commit", "testing"]);
  });

  it("dedupes skills invoked multiple times on the same turn", () => {
    const entries: ClaudeTranscriptEntry[] = [
      assistantWithSkills(["testing", "testing", "commit"], "a1"),
    ];
    const got = computeSkillTurnAttribution(entries, { sessionId: SID });
    expect(got.entries[0]!.skillsActivatedOnThisTurn).toEqual(["testing", "commit"]);
    expect(got.entries[0]!.skillsActiveCumulative).toEqual(["commit", "testing"]);
  });

  it("ignores system entries and keeps turnIndex aligned with user+assistant", () => {
    const entries: ClaudeTranscriptEntry[] = [
      userText("/testing"),
      {
        type: "system",
        sessionId: SID,
        parentUuid: "a1",
        subtype: "turn_duration",
        durationMs: 100,
      } as unknown as ClaudeTranscriptEntry,
      assistantWithSkills(["testing"], "a1"),
    ];
    const got = computeSkillTurnAttribution(entries, { sessionId: SID });
    expect(got.entries.map((e) => e.turnIndex)).toEqual([0, 1]);
    expect(got.entries[1]!.skillsActivatedOnThisTurn).toEqual(["testing"]);
  });
});

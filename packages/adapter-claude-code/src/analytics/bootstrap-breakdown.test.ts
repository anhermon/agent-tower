import { describe, expect, it } from "vitest";

import { computeBootstrapBreakdown } from "./bootstrap-breakdown.js";

import type { ClaudeTranscriptEntry } from "../types.js";

const SID = "session-bootstrap";

function systemEntry(content: string): ClaudeTranscriptEntry {
  return {
    type: "system",
    sessionId: SID,
    uuid: "sys1",
    parentUuid: null,
    timestamp: "2026-03-01T08:00:00.000Z",
    content,
  } as unknown as ClaudeTranscriptEntry;
}

function userEntry(text: string): ClaudeTranscriptEntry {
  return {
    type: "user",
    sessionId: SID,
    uuid: "u1",
    timestamp: "2026-03-01T08:00:01.000Z",
    message: { role: "user", content: text },
  } as unknown as ClaudeTranscriptEntry;
}

function turnDurationEntry(): ClaudeTranscriptEntry {
  return {
    type: "system",
    sessionId: SID,
    uuid: "td1",
    subtype: "turn_duration",
    durationMs: 1000,
  } as unknown as ClaudeTranscriptEntry;
}

const SAMPLE_SYSTEM_PROMPT = `You are an assistant.\n\nContents of /workspace/CLAUDE.md (project instructions, checked into the codebase):\n\nThis is the project CLAUDE.md content. It has instructions.\n\nContents of /workspace/AGENTS.md:\n\nThis is the AGENTS.md content describing agent protocols.\n\nContents of /workspace/docs/extra.md:\n\nExtra documentation injected into context.\n`;

describe("computeBootstrapBreakdown", () => {
  it("returns empty result when there is no system entry", () => {
    const entries: ClaudeTranscriptEntry[] = [userEntry("hello")];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    expect(got.sessionId).toBe(SID);
    expect(got.systemPromptBytes).toBe(0);
    expect(got.estimatedSystemPromptTokens).toBe(0);
    expect(got.components).toEqual([]);
    expect(got.parseFailed).toBe(false);
  });

  it("skips turn_duration system entries and finds content entries", () => {
    const entries: ClaudeTranscriptEntry[] = [
      turnDurationEntry(),
      systemEntry(SAMPLE_SYSTEM_PROMPT),
      userEntry("hello"),
    ];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    expect(got.systemPromptBytes).toBeGreaterThan(0);
    expect(got.components.length).toBeGreaterThan(0);
  });

  it("identifies claude_md, agents_md, and other_md components", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });

    const kinds = got.components.map((c) => c.kind);
    expect(kinds).toContain("claude_md");
    expect(kinds).toContain("agents_md");
    expect(kinds).toContain("other_md");
    expect(kinds).toContain("system_preamble");
  });

  it("names claude_md component with the file path", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    const claudeMd = got.components.find((c) => c.kind === "claude_md");
    expect(claudeMd?.name).toBe("/workspace/CLAUDE.md");
  });

  it("names agents_md component with the file path", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    const agentsMd = got.components.find((c) => c.kind === "agents_md");
    expect(agentsMd?.name).toBe("/workspace/AGENTS.md");
  });

  it("reports positive sizeBytes and estimatedTokens for each component", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    for (const comp of got.components) {
      expect(comp.sizeBytes).toBeGreaterThan(0);
      expect(comp.estimatedTokens).toBeGreaterThan(0);
    }
  });

  it("systemPromptBytes equals the full system prompt length", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    expect(got.systemPromptBytes).toBe(Buffer.byteLength(SAMPLE_SYSTEM_PROMPT, "utf8"));
  });

  it("estimatedSystemPromptTokens is non-zero and proportional to bytes", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    // Token estimate = ceil(bytes / 4)
    expect(got.estimatedSystemPromptTokens).toBe(
      Math.ceil(Buffer.byteLength(SAMPLE_SYSTEM_PROMPT, "utf8") / 4)
    );
  });

  it("sorts components largest-first", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    for (let i = 1; i < got.components.length; i++) {
      expect(got.components[i - 1]!.sizeBytes).toBeGreaterThanOrEqual(got.components[i]!.sizeBytes);
    }
  });

  it("excerpt is at most 200 characters", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    for (const comp of got.components) {
      expect(comp.excerpt.length).toBeLessThanOrEqual(200);
    }
  });

  it("handles a system entry with no 'Contents of' markers", () => {
    const plainContent = "You are an assistant. Be helpful.\n";
    const entries: ClaudeTranscriptEntry[] = [systemEntry(plainContent)];
    const got = computeBootstrapBreakdown(entries, { sessionId: SID });
    expect(got.systemPromptBytes).toBe(Buffer.byteLength(plainContent, "utf8"));
    expect(got.components).toHaveLength(1);
    expect(got.components[0]!.kind).toBe("system_preamble");
    expect(got.parseFailed).toBe(false);
  });

  it("reads sessionId from first entry when not provided in options", () => {
    const entries: ClaudeTranscriptEntry[] = [systemEntry(SAMPLE_SYSTEM_PROMPT)];
    const got = computeBootstrapBreakdown(entries);
    expect(got.sessionId).toBe(SID);
  });

  it("uses message.content when entry.content is absent", () => {
    const entryWithMessage: ClaudeTranscriptEntry = {
      type: "system",
      sessionId: SID,
      uuid: "sys2",
      message: {
        role: "system",
        content: SAMPLE_SYSTEM_PROMPT,
      },
    } as unknown as ClaudeTranscriptEntry;
    const got = computeBootstrapBreakdown([entryWithMessage], { sessionId: SID });
    expect(got.systemPromptBytes).toBe(Buffer.byteLength(SAMPLE_SYSTEM_PROMPT, "utf8"));
    expect(got.components.length).toBeGreaterThan(0);
  });
});

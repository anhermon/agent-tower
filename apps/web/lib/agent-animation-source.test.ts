import type { ClaudeTranscriptEntry } from "@control-plane/adapter-claude-code";
import { AGENT_ANIMATION_BASE_STATES, AGENT_ANIMATION_OVERLAYS } from "@control-plane/core";
import { describe, expect, it } from "vitest";
import {
  AGENT_ANIMATION_PERMISSION_TIMEOUT_MS,
  deriveAgentAnimationSnapshot,
} from "./agent-animation-source";

const AGENT_ID = "claude-code:-Users-test-app";
const PROJECT_ID = "-Users-test-app";
const SESSION_ID = "11111111-2222-3333-4444-555555555555";

describe("agent-animation-source", () => {
  it("given_assistant_text_activity__when_derived__then_snapshot_is_working", () => {
    const result = deriveAgentAnimationSnapshot({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      now: new Date("2026-04-23T10:00:02.000Z"),
      entries: [assistant("2026-04-23T10:00:01.000Z", [{ type: "text", text: "Working on it." }])],
    });

    expect(result.snapshot).toMatchObject({
      baseState: AGENT_ANIMATION_BASE_STATES.Working,
      overlay: AGENT_ANIMATION_OVERLAYS.None,
      activeSessionIds: [SESSION_ID],
    });
  });

  it("given_unresolved_non_exempt_tool_after_timeout__when_derived__then_snapshot_requests_permission", () => {
    const result = deriveAgentAnimationSnapshot({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      now: new Date(1_000 + AGENT_ANIMATION_PERMISSION_TIMEOUT_MS + 1),
      entries: [
        assistant(new Date(1_000).toISOString(), [
          { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "pwd" } },
        ]),
      ],
    });

    expect(result.nextPermissionCheckAtMs).toBeNull();
    expect(result.snapshot).toMatchObject({
      baseState: AGENT_ANIMATION_BASE_STATES.Attention,
      overlay: AGENT_ANIMATION_OVERLAYS.Permission,
      activeSessionIds: [SESSION_ID],
    });
  });

  it("given_unresolved_non_exempt_tool_before_timeout__when_derived__then_snapshot_stays_working_and_schedules_permission_check", () => {
    const toolAt = 1_000;
    const result = deriveAgentAnimationSnapshot({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      now: new Date(toolAt + AGENT_ANIMATION_PERMISSION_TIMEOUT_MS - 1),
      entries: [
        assistant(new Date(toolAt).toISOString(), [
          { type: "tool_use", id: "tool-1", name: "Edit", input: { file_path: "x" } },
        ]),
      ],
    });

    expect(result.nextPermissionCheckAtMs).toBe(toolAt + AGENT_ANIMATION_PERMISSION_TIMEOUT_MS);
    expect(result.snapshot).toMatchObject({
      baseState: AGENT_ANIMATION_BASE_STATES.Working,
      overlay: AGENT_ANIMATION_OVERLAYS.None,
    });
  });

  it("given_exempt_tool_use__when_derived_after_timeout__then_it_does_not_request_permission", () => {
    const result = deriveAgentAnimationSnapshot({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      now: new Date("2026-04-23T10:00:30.000Z"),
      entries: [
        assistant("2026-04-23T10:00:00.000Z", [
          { type: "tool_use", id: "task-1", name: "Task", input: { prompt: "Scout" } },
        ]),
      ],
    });

    expect(result.nextPermissionCheckAtMs).toBeNull();
    expect(result.snapshot).toMatchObject({
      baseState: AGENT_ANIMATION_BASE_STATES.Working,
      overlay: AGENT_ANIMATION_OVERLAYS.None,
    });
  });

  it("given_tool_result_error__when_derived__then_snapshot_has_failure_overlay", () => {
    const result = deriveAgentAnimationSnapshot({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      now: new Date("2026-04-23T10:00:03.000Z"),
      entries: [
        assistant("2026-04-23T10:00:01.000Z", [
          { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "false" } },
        ]),
        user("2026-04-23T10:00:02.000Z", [
          { type: "tool_result", tool_use_id: "tool-1", is_error: true, content: "failed" },
        ]),
      ],
    });

    expect(result.snapshot).toMatchObject({
      baseState: AGENT_ANIMATION_BASE_STATES.Failed,
      overlay: AGENT_ANIMATION_OVERLAYS.Failure,
    });
  });

  it("given_turn_duration__when_derived__then_snapshot_has_success_done_state", () => {
    const result = deriveAgentAnimationSnapshot({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      now: new Date("2026-04-23T10:00:03.000Z"),
      entries: [
        assistant("2026-04-23T10:00:01.000Z", [{ type: "text", text: "Done." }]),
        system("2026-04-23T10:00:02.000Z", "turn_duration"),
      ],
    });

    expect(result.snapshot).toMatchObject({
      baseState: AGENT_ANIMATION_BASE_STATES.Done,
      overlay: AGENT_ANIMATION_OVERLAYS.Success,
      activeSessionIds: [],
    });
  });

  it("given_foreground_and_background_subagents__when_derived__then_subagent_count_is_reported", () => {
    const result = deriveAgentAnimationSnapshot({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      now: new Date("2026-04-23T10:00:03.000Z"),
      backgroundSubagentCount: 2,
      entries: [
        progress("2026-04-23T10:00:01.000Z", {
          type: "agent_progress",
          parentToolUseID: "task-1",
        }),
      ],
    });

    expect(result.snapshot).toMatchObject({
      baseState: AGENT_ANIMATION_BASE_STATES.Working,
      overlay: AGENT_ANIMATION_OVERLAYS.Subagent,
      subagentCount: 3,
    });
  });

  it("given_stale_startup_file__when_derived__then_no_snapshot_is_emitted", () => {
    const result = deriveAgentAnimationSnapshot({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
      now: new Date("2026-04-23T10:30:00.000Z"),
      fileModifiedAt: new Date("2026-04-23T10:00:00.000Z"),
      startup: true,
      entries: [assistant("2026-04-23T10:00:00.000Z", [{ type: "text", text: "Old work." }])],
    });

    expect(result.snapshot).toBeNull();
  });
});

function assistant(
  timestamp: string,
  content: readonly Record<string, unknown>[]
): ClaudeTranscriptEntry {
  return {
    type: "assistant",
    sessionId: SESSION_ID,
    uuid: `assistant-${timestamp}`,
    timestamp,
    message: { role: "assistant", content },
  } as ClaudeTranscriptEntry;
}

function user(
  timestamp: string,
  content: readonly Record<string, unknown>[]
): ClaudeTranscriptEntry {
  return {
    type: "user",
    sessionId: SESSION_ID,
    uuid: `user-${timestamp}`,
    timestamp,
    message: { role: "user", content },
  } as ClaudeTranscriptEntry;
}

function system(timestamp: string, subtype: string): ClaudeTranscriptEntry {
  return {
    type: "system",
    sessionId: SESSION_ID,
    uuid: `system-${timestamp}`,
    timestamp,
    subtype,
  } as ClaudeTranscriptEntry;
}

function progress(timestamp: string, data: Record<string, unknown>): ClaudeTranscriptEntry {
  return {
    type: "progress",
    sessionId: SESSION_ID,
    uuid: `progress-${timestamp}`,
    timestamp,
    data,
    parentToolUseID: data.parentToolUseID,
    toolUseID: data.toolUseID,
  } as ClaudeTranscriptEntry;
}

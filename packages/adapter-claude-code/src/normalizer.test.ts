import { describe, expect, it } from "vitest";

import {
  AGENT_RUNTIMES,
  SESSION_ACTOR_ROLES,
  SESSION_STATES,
  TOOL_CALL_STATUSES,
} from "@control-plane/core";

import { normalizeTranscript } from "./normalizer.js";

import type { ClaudeTranscriptEntry } from "./types.js";

const SESSION_ID = "session-abc";
const BASE = {
  sessionId: SESSION_ID,
  cwd: "/tmp/project",
  version: "2.1.97",
} as const;

describe("normalizeTranscript", () => {
  it("given_an_empty_transcript__when_normalizing__then_it_throws", () => {
    expect(() => normalizeTranscript([])).toThrow();
  });

  it("given_a_minimal_user_then_assistant_transcript__when_normalizing__then_session_turns_are_canonicalized", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        ...BASE,
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "Hello" },
      },
      {
        ...BASE,
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        timestamp: "2026-01-01T00:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "Hi there" }],
        },
      },
    ];

    const result = normalizeTranscript(entries);

    expect(result.session.id).toBe(SESSION_ID);
    expect(result.session.runtime).toBe(AGENT_RUNTIMES.Claude);
    expect(result.session.state).toBe(SESSION_STATES.Completed);
    expect(result.session.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.session.updatedAt).toBe("2026-01-01T00:00:01.000Z");
    expect(result.session.metadata?.model).toBe("claude-sonnet-4-6");
    expect(result.session.metadata?.cwd).toBe("/tmp/project");

    expect(result.turns).toHaveLength(2);
    const [userTurn, assistantTurn] = result.turns;
    expectDefined(userTurn);
    expectDefined(assistantTurn);
    expect(userTurn.actor.role).toBe(SESSION_ACTOR_ROLES.User);
    expect(userTurn.content.kind).toBe("text");
    expect(userTurn.sequence).toBe(1);
    expect(assistantTurn.actor.role).toBe(SESSION_ACTOR_ROLES.Agent);
    expect(assistantTurn.sequence).toBe(2);
  });

  it("given_assistant_tool_use_and_user_tool_result__when_normalizing__then_tool_calls_and_results_pair_up", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        ...BASE,
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Plan first" },
            { type: "tool_use", id: "tool_use_1", name: "Bash", input: { command: "ls" } },
          ],
        },
      },
      {
        ...BASE,
        type: "user",
        uuid: "u2",
        parentUuid: "a1",
        timestamp: "2026-01-01T00:00:01.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_use_1",
              content: "file1\nfile2",
            },
          ],
        },
      },
    ];

    const result = normalizeTranscript(entries);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolCalls[0]?.id).toBe("tool_use_1");
    expect(result.toolCalls[0]?.toolName).toBe("Bash");
    expect(result.toolCalls[0]?.status).toBe(TOOL_CALL_STATUSES.Running);
    expect(result.toolResults[0]?.callId).toBe("tool_use_1");
    expect(result.toolResults[0]?.status).toBe(TOOL_CALL_STATUSES.Succeeded);

    const toolCallTurn = result.turns.find((turn) => turn.content.kind === "tool_call");
    expectDefined(toolCallTurn);
    if (toolCallTurn.content.kind === "tool_call") {
      expect(toolCallTurn.content.call.toolName).toBe("Bash");
    }

    const toolResultTurn = result.turns.find((turn) => turn.content.kind === "tool_result");
    expectDefined(toolResultTurn);
    expect(toolResultTurn.actor.role).toBe(SESSION_ACTOR_ROLES.Tool);
  });

  it("given_a_tool_result_with_is_error__when_normalizing__then_status_is_failed", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        ...BASE,
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "broken",
              is_error: true,
              content: "boom",
            },
          ],
        },
      },
    ];

    const { toolResults } = normalizeTranscript(entries);
    expect(toolResults[0]?.status).toBe(TOOL_CALL_STATUSES.Failed);
  });

  it("given_a_transcript_with_a_first_user_message__when_normalizing__then_the_session_gets_a_derived_title", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        ...BASE,
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "Summarize the onboarding doc\nand file a ticket" },
      },
    ];
    const { session } = normalizeTranscript(entries);
    expect(session.title).toBe("Summarize the onboarding doc");
  });

  it("given_a_transcript_with_a_summary_entry__when_normalizing__then_the_summary_wins_over_user_text", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        ...BASE,
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "raw user question" },
      },
      {
        ...BASE,
        type: "summary",
        summary: "Designing the webhook retry policy",
      },
    ];
    const { session } = normalizeTranscript(entries);
    expect(session.title).toBe("Designing the webhook retry policy");
  });

  it("given_a_first_user_message_wrapped_in_local_command_caveat__when_normalizing__then_title_skips_it_and_falls_through", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        ...BASE,
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: {
          role: "user",
          content: "<local-command-caveat>Caveat: running /status</local-command-caveat>",
        },
      },
      {
        ...BASE,
        type: "user",
        uuid: "u2",
        timestamp: "2026-01-01T00:00:01.000Z",
        message: { role: "user", content: "Plan the migration to Postgres 16" },
      },
    ];
    const { session } = normalizeTranscript(entries);
    expect(session.title).toBe("Plan the migration to Postgres 16");
  });

  it("given_only_stub_user_text__when_normalizing__then_title_is_undefined", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        ...BASE,
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "ping" },
      },
    ];
    const { session } = normalizeTranscript(entries);
    expect(session.title).toBeUndefined();
  });

  it("given_an_explicit_title_option__when_normalizing__then_it_overrides_derivation", () => {
    const entries: ClaudeTranscriptEntry[] = [
      {
        ...BASE,
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "raw" },
      },
    ];
    const { session } = normalizeTranscript(entries, { title: "Explicit" });
    expect(session.title).toBe("Explicit");
  });

  it("given_unknown_entries__when_normalizing__then_they_are_skipped_and_counted", () => {
    const entries: ClaudeTranscriptEntry[] = [
      { ...BASE, type: "permission-mode" },
      { ...BASE, type: "attachment", attachment: {} },
      {
        ...BASE,
        type: "user",
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: "hi" },
      },
    ];

    const result = normalizeTranscript(entries);

    expect(result.turns).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(result.batch.session.id).toBe(SESSION_ID);
    expect(result.batch.turns).toHaveLength(1);
  });
});

function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getConfiguredTicketsFile,
  groupTicketsByStatus,
  KANBAN_LANE_ORDER,
  listTicketsOrEmpty,
  loadTicketOrUndefined,
  resolveTicketsFile,
  TICKETS_FILE_ENV,
} from "./kanban-source";

const SAMPLE_TICKETS = [
  {
    id: "TCK-1",
    title: "Wire kanban adapter",
    status: "open",
    priority: "high",
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-02T11:00:00.000Z",
    assigneeAgentId: "claude-code:-Users-someone-project",
    description: "Build the first read-only ticket source.",
  },
  {
    id: "TCK-2",
    title: "Investigate stuck session",
    status: "in_progress",
    priority: "urgent",
    createdAt: "2026-04-03T08:15:00.000Z",
    updatedAt: "2026-04-03T12:00:00.000Z",
    sessionId: "11111111-2222-3333-4444-555555555555",
  },
  {
    id: "TCK-3",
    title: "Draft phase 2 scope",
    status: "blocked",
    priority: "normal",
    createdAt: "2026-03-10T09:30:00.000Z",
    updatedAt: "2026-03-15T17:00:00.000Z",
  },
  {
    id: "TCK-4",
    title: "Close out Phase 1 gaps",
    status: "resolved",
    priority: "low",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-12T15:45:00.000Z",
    externalUrl: "https://example.invalid/tickets/TCK-4",
  },
];

describe("kanban-source", () => {
  const originalEnv = process.env[TICKETS_FILE_ENV];
  let tempDir: string | null = null;

  beforeEach(async () => {
    delete process.env[TICKETS_FILE_ENV];
    tempDir = await mkdtemp(path.join(os.tmpdir(), "control-plane-tickets-"));
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env[TICKETS_FILE_ENV];
    } else {
      process.env[TICKETS_FILE_ENV] = originalEnv;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("given_no_env_var__when_resolving__then_returns_null_and_unconfigured", async () => {
    expect(resolveTicketsFile()).toBeNull();
    expect(getConfiguredTicketsFile()).toBeNull();
    const result = await listTicketsOrEmpty();
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("given_empty_env_var__when_resolving__then_returns_null", async () => {
    process.env[TICKETS_FILE_ENV] = "   ";
    expect(resolveTicketsFile()).toBeNull();
    const result = await listTicketsOrEmpty();
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("given_env_var_pointing_at_missing_file__when_listing__then_returns_error", async () => {
    const missing = path.join(tempDir!, "does-not-exist.json");
    process.env[TICKETS_FILE_ENV] = missing;

    const result = await listTicketsOrEmpty();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(result.message).toContain(missing);
  });

  it("given_valid_json_array_file__when_listing__then_returns_tickets_with_canonical_fields", async () => {
    const filePath = path.join(tempDir!, "tickets.json");
    await writeFile(filePath, JSON.stringify(SAMPLE_TICKETS), "utf8");
    process.env[TICKETS_FILE_ENV] = filePath;

    const result = await listTicketsOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tickets).toHaveLength(4);
    expect(result.tickets[0].id).toBe("TCK-1");
    expect(result.tickets[0].assigneeAgentId).toBe("claude-code:-Users-someone-project");
    expect(result.source.filePath).toBe(filePath);
    expect(result.source.origin).toBe("env");
  });

  it("given_valid_jsonl_file__when_listing__then_parses_each_line_into_ticket", async () => {
    const filePath = path.join(tempDir!, "tickets.jsonl");
    const jsonl = SAMPLE_TICKETS.map((ticket) => JSON.stringify(ticket)).join("\n");
    await writeFile(filePath, `${jsonl}\n`, "utf8");
    process.env[TICKETS_FILE_ENV] = filePath;

    const result = await listTicketsOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tickets.map((ticket) => ticket.id)).toEqual(["TCK-1", "TCK-2", "TCK-3", "TCK-4"]);
  });

  it("given_malformed_json__when_listing__then_returns_error_reason", async () => {
    const filePath = path.join(tempDir!, "tickets.json");
    await writeFile(filePath, "{not-json", "utf8");
    process.env[TICKETS_FILE_ENV] = filePath;

    const result = await listTicketsOrEmpty();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(typeof result.message).toBe("string");
  });

  it("given_ticket_with_unknown_status__when_listing__then_returns_error_reason", async () => {
    const filePath = path.join(tempDir!, "tickets.json");
    const bad = [{ ...SAMPLE_TICKETS[0], status: "bogus" }];
    await writeFile(filePath, JSON.stringify(bad), "utf8");
    process.env[TICKETS_FILE_ENV] = filePath;

    const result = await listTicketsOrEmpty();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(result.message).toMatch(/unknown status/i);
  });

  it("given_empty_json_array__when_listing__then_returns_ok_with_empty_list", async () => {
    const filePath = path.join(tempDir!, "tickets.json");
    await writeFile(filePath, "[]", "utf8");
    process.env[TICKETS_FILE_ENV] = filePath;

    const result = await listTicketsOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tickets).toEqual([]);
  });

  it("given_valid_file__when_loading_by_id__then_returns_matching_ticket", async () => {
    const filePath = path.join(tempDir!, "tickets.json");
    await writeFile(filePath, JSON.stringify(SAMPLE_TICKETS), "utf8");
    process.env[TICKETS_FILE_ENV] = filePath;

    const result = await loadTicketOrUndefined("TCK-2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.title).toBe("Investigate stuck session");
    expect(result.ticket.sessionId).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("given_unknown_id__when_loading__then_returns_not_found", async () => {
    const filePath = path.join(tempDir!, "tickets.json");
    await writeFile(filePath, JSON.stringify(SAMPLE_TICKETS), "utf8");
    process.env[TICKETS_FILE_ENV] = filePath;

    const result = await loadTicketOrUndefined("missing");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("given_tickets_across_statuses__when_grouping__then_respects_canonical_lane_order", () => {
    const grouped = groupTicketsByStatus(SAMPLE_TICKETS.map((ticket) => ({ ...ticket })) as never);
    expect(Object.keys(grouped)).toEqual([...KANBAN_LANE_ORDER]);
    expect(grouped.open.map((ticket) => ticket.id)).toEqual(["TCK-1"]);
    expect(grouped.in_progress.map((ticket) => ticket.id)).toEqual(["TCK-2"]);
    expect(grouped.blocked.map((ticket) => ticket.id)).toEqual(["TCK-3"]);
    expect(grouped.resolved.map((ticket) => ticket.id)).toEqual(["TCK-4"]);
    expect(grouped.closed).toEqual([]);
  });
});

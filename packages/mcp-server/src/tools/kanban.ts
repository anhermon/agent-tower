/**
 * MCP tools for the local file-backed kanban control plane.
 *
 * Four tools:
 *   kanban_list   — list tickets from the local file
 *   kanban_create — create a new ticket in the local file
 *   kanban_assign — assign an agent to a ticket
 *   kanban_move   — move a ticket to a new lane (status)
 *
 * Fully local-first — no external API calls. Reads and writes the file
 * pointed at by CLAUDE_CONTROL_PLANE_TICKETS_FILE (per ADR-0002, ADR-0003).
 * Agent wake on move fires a POST to CLAUDE_CONTROL_PLANE_KANBAN_WAKE_WEBHOOK_URL
 * if that env var is set.
 */

import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import {
  type TicketPriority,
  type TicketRecord,
  type TicketStatus,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "@control-plane/core";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const TICKETS_FILE_ENV = "CLAUDE_CONTROL_PLANE_TICKETS_FILE";
const WAKE_WEBHOOK_ENV = "CLAUDE_CONTROL_PLANE_KANBAN_WAKE_WEBHOOK_URL";

const VALID_STATUSES = new Set<string>(Object.values(TICKET_STATUSES));
const VALID_PRIORITIES = new Set<string>(Object.values(TICKET_PRIORITIES));

function getTicketsFilePath(): string | null {
  const raw = process.env[TICKETS_FILE_ENV]?.trim();
  return raw ?? null;
}

const UNCONFIGURED_RESULT: ToolResult = {
  ok: false,
  reason: "unconfigured",
  message: `${TICKETS_FILE_ENV} is not set. Point it at a JSON/JSONL file to enable kanban.`,
};

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function fileExists(filePath: string): boolean {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

async function loadTickets(filePath: string): Promise<TicketRecord[]> {
  if (!fileExists(filePath)) return [];
  const raw = await readFile(filePath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const parsed: unknown = trimmed.startsWith("[")
    ? JSON.parse(trimmed)
    : trimmed
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as unknown);

  return Array.isArray(parsed) ? (parsed as TicketRecord[]) : [];
}

async function persistTickets(filePath: string, tickets: readonly TicketRecord[]): Promise<void> {
  await writeFile(filePath, JSON.stringify(tickets, null, 2) + "\n", "utf8");
}

async function fireWake(
  ticketId: string,
  assigneeAgentId: string,
  previousStatus: TicketStatus,
  newStatus: TicketStatus
): Promise<void> {
  const url = process.env[WAKE_WEBHOOK_ENV]?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId,
        assigneeAgentId,
        previousStatus,
        newStatus,
        triggeredAt: new Date().toISOString(),
      }),
    });
  } catch {
    // Wake failures must never fail the mutation
  }
}

// ---------------------------------------------------------------------------
// kanban_list
// ---------------------------------------------------------------------------

export const kanbanListTool: ToolDefinition = {
  name: "kanban_list",
  description:
    "List tickets from the local kanban file as canonical TicketRecord objects. Returns id, title, status, priority, assigneeAgentId, createdAt, updatedAt.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: [...Object.values(TICKET_STATUSES), "all"],
        description: "Filter by status (default: all)",
      },
    },
    additionalProperties: false,
  },
  handler: async (input: unknown): Promise<ToolResult> => {
    const filePath = getTicketsFilePath();
    if (!filePath) return UNCONFIGURED_RESULT;

    try {
      const params = asRecord(input);
      let tickets = await loadTickets(filePath);
      const statusFilter =
        typeof params.status === "string" && params.status !== "all" ? params.status : null;
      if (statusFilter && VALID_STATUSES.has(statusFilter)) {
        tickets = tickets.filter((t) => t.status === statusFilter);
      }
      return { ok: true, count: tickets.length, tickets };
    } catch (error) {
      return errorResult(error);
    }
  },
};

// ---------------------------------------------------------------------------
// kanban_create
// ---------------------------------------------------------------------------

export const kanbanCreateTool: ToolDefinition = {
  name: "kanban_create",
  description:
    "Create a new ticket in the local kanban file. Returns the created TicketRecord with a generated id. New tickets always start in the 'open' lane.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short, descriptive title (required)" },
      description: {
        type: "string",
        description: "Markdown body with context and acceptance criteria",
      },
      priority: {
        type: "string",
        enum: Object.values(TICKET_PRIORITIES),
        description: "Ticket priority (default: normal)",
      },
      assigneeAgentId: {
        type: "string",
        description: "Agent id to assign. Use cp agents list or kanban_list to find agent ids.",
      },
    },
    required: ["title"],
    additionalProperties: false,
  },
  handler: async (input: unknown): Promise<ToolResult> => {
    const filePath = getTicketsFilePath();
    if (!filePath) return UNCONFIGURED_RESULT;

    try {
      const params = asRecord(input);
      const title = params.title;
      if (typeof title !== "string" || title.trim().length === 0) {
        return { ok: false, reason: "bad_input", message: "title is required" };
      }

      const rawPriority = typeof params.priority === "string" ? params.priority : "normal";
      if (!VALID_PRIORITIES.has(rawPriority)) {
        return {
          ok: false,
          reason: "bad_input",
          message: `priority must be one of: ${[...VALID_PRIORITIES].join(", ")}`,
        };
      }

      const all = await loadTickets(filePath);
      const now = new Date().toISOString();
      const ticket: TicketRecord = {
        id: randomUUID(),
        title: title.trim(),
        status: TICKET_STATUSES.Open,
        priority: rawPriority as TicketPriority,
        createdAt: now,
        updatedAt: now,
        ...(typeof params.description === "string" && params.description
          ? { description: params.description }
          : {}),
        ...(typeof params.assigneeAgentId === "string" && params.assigneeAgentId
          ? { assigneeAgentId: params.assigneeAgentId }
          : {}),
      };

      await persistTickets(filePath, [...all, ticket]);
      return { ok: true, ticket };
    } catch (error) {
      return errorResult(error);
    }
  },
};

// ---------------------------------------------------------------------------
// kanban_assign
// ---------------------------------------------------------------------------

export const kanbanAssignTool: ToolDefinition = {
  name: "kanban_assign",
  description:
    "Assign an agent to an existing ticket. ticketId must match the ticket's id field (or a prefix). Returns the updated TicketRecord.",
  inputSchema: {
    type: "object",
    properties: {
      ticketId: { type: "string", description: "Ticket id (full UUID or unique prefix)" },
      agentId: { type: "string", description: "Agent id to assign" },
    },
    required: ["ticketId", "agentId"],
    additionalProperties: false,
  },
  handler: async (input: unknown): Promise<ToolResult> => {
    const filePath = getTicketsFilePath();
    if (!filePath) return UNCONFIGURED_RESULT;

    try {
      const params = asRecord(input);
      const ticketId = params.ticketId;
      const agentId = params.agentId;
      if (typeof ticketId !== "string" || !ticketId.trim()) {
        return { ok: false, reason: "bad_input", message: "ticketId is required" };
      }
      if (typeof agentId !== "string" || !agentId.trim()) {
        return { ok: false, reason: "bad_input", message: "agentId is required" };
      }

      const all = await loadTickets(filePath);
      const id = ticketId.trim();
      const idx = all.findIndex((t) => t.id === id || t.id.startsWith(id));
      if (idx === -1) {
        return { ok: false, reason: "not_found", message: `Ticket not found: ${id}` };
      }

      const updated: TicketRecord = {
        ...all[idx]!,
        assigneeAgentId: agentId.trim(),
        updatedAt: new Date().toISOString(),
      };
      const next = [...all];
      next[idx] = updated;
      await persistTickets(filePath, next);
      return { ok: true, ticket: updated };
    } catch (error) {
      return errorResult(error);
    }
  },
};

// ---------------------------------------------------------------------------
// kanban_move
// ---------------------------------------------------------------------------

export const kanbanMoveTool: ToolDefinition = {
  name: "kanban_move",
  description:
    "Move a ticket to a new lane (status). If the ticket has an assignee and CLAUDE_CONTROL_PLANE_KANBAN_WAKE_WEBHOOK_URL is set, fires a POST to that URL with the wake context. Returns the updated TicketRecord.",
  inputSchema: {
    type: "object",
    properties: {
      ticketId: { type: "string", description: "Ticket id (full UUID or unique prefix)" },
      status: {
        type: "string",
        enum: Object.values(TICKET_STATUSES),
        description: "Target TicketStatus lane",
      },
    },
    required: ["ticketId", "status"],
    additionalProperties: false,
  },
  handler: async (input: unknown): Promise<ToolResult> => {
    const filePath = getTicketsFilePath();
    if (!filePath) return UNCONFIGURED_RESULT;

    try {
      const params = asRecord(input);
      const ticketId = params.ticketId;
      const status = params.status;
      if (typeof ticketId !== "string" || !ticketId.trim()) {
        return { ok: false, reason: "bad_input", message: "ticketId is required" };
      }
      if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
        return {
          ok: false,
          reason: "bad_input",
          message: `status must be one of: ${[...VALID_STATUSES].join(", ")}`,
        };
      }

      const all = await loadTickets(filePath);
      const id = ticketId.trim();
      const idx = all.findIndex((t) => t.id === id || t.id.startsWith(id));
      if (idx === -1) {
        return { ok: false, reason: "not_found", message: `Ticket not found: ${id}` };
      }

      const current = all[idx]!;
      const previousStatus = current.status;
      const newStatus = status as TicketStatus;
      const updated: TicketRecord = {
        ...current,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };
      const next = [...all];
      next[idx] = updated;
      await persistTickets(filePath, next);

      if (newStatus !== previousStatus && updated.assigneeAgentId) {
        await fireWake(updated.id, updated.assigneeAgentId, previousStatus, newStatus);
      }

      return { ok: true, ticket: updated };
    } catch (error) {
      return errorResult(error);
    }
  },
};

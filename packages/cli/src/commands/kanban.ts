/**
 * cp kanban — Local file-backed kanban management CLI.
 *
 * Reads and writes the canonical TicketRecord JSON/JSONL file pointed at by
 * CLAUDE_CONTROL_PLANE_TICKETS_FILE. No external API calls — fully local-first
 * per the agent-tower adapter contract (ADR-0002, ADR-0003).
 *
 * Subcommands:
 *   list                                       List tickets from the local file
 *   create --title <t> [--desc <d>] [--priority p] [--assign <agentId>]
 *   assign <ticketId> --agent <agentId>
 *   move   <ticketId> --status <ticketStatus>
 *
 * Requires: CLAUDE_CONTROL_PLANE_TICKETS_FILE (path to tickets JSON/JSONL file)
 * Optional: CLAUDE_CONTROL_PLANE_KANBAN_WAKE_WEBHOOK_URL (POST on lane move)
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

import { parseFlags, UsageError } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

// ---------------------------------------------------------------------------
// Env / file resolution
// ---------------------------------------------------------------------------

const TICKETS_FILE_ENV = "CLAUDE_CONTROL_PLANE_TICKETS_FILE";
const WAKE_WEBHOOK_ENV = "CLAUDE_CONTROL_PLANE_KANBAN_WAKE_WEBHOOK_URL";

const VALID_STATUSES = new Set<string>(Object.values(TICKET_STATUSES));
const VALID_PRIORITIES = new Set<string>(Object.values(TICKET_PRIORITIES));

function resolveTicketsFilePath(): string {
  const raw = process.env[TICKETS_FILE_ENV]?.trim();
  if (!raw) throw new UsageError(`${TICKETS_FILE_ENV} is not set`);
  return raw;
}

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

  if (!Array.isArray(parsed)) return [];
  return parsed as TicketRecord[];
}

async function persistTickets(filePath: string, tickets: readonly TicketRecord[]): Promise<void> {
  await writeFile(filePath, JSON.stringify(tickets, null, 2) + "\n", "utf8");
}

/** Fire wake webhook if configured. Errors are swallowed. */
async function fireWakeWebhook(
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
// Subcommand: list
// ---------------------------------------------------------------------------

async function runKanbanList(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{ json?: boolean; pretty?: boolean }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });
  const mode = resolveOutputMode(values);
  const filePath = resolveTicketsFilePath();
  const tickets = await loadTickets(filePath);

  if (mode.json) {
    writeJson({ ok: true, count: tickets.length, tickets });
    return 0;
  }

  writeLine(bold(`Kanban (${tickets.length} tickets)`));
  writeLine("");
  if (tickets.length === 0) {
    writeLine("No tickets found.");
    return 0;
  }

  const rows = tickets.map((t) => [
    t.id.slice(0, 8),
    t.status,
    t.priority,
    t.title.slice(0, 50),
    t.assigneeAgentId?.slice(0, 20) ?? "—",
  ]);
  writeLine(renderTable(["id", "status", "priority", "title", "assignee"], rows));
  return 0;
}

// ---------------------------------------------------------------------------
// Subcommand: create
// ---------------------------------------------------------------------------

async function runKanbanCreate(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    title?: string;
    desc?: string;
    description?: string;
    priority?: string;
    assign?: string;
    json?: boolean;
    pretty?: boolean;
  }>(argv, {
    title: { type: "string" },
    desc: { type: "string" },
    description: { type: "string" },
    priority: { type: "string" },
    assign: { type: "string" },
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });

  const mode = resolveOutputMode(values);
  const title = values.title?.trim();
  if (!title) throw new UsageError("--title is required");

  const rawPriority = (values.priority ?? "normal").toLowerCase();
  if (!VALID_PRIORITIES.has(rawPriority)) {
    throw new UsageError(
      `Invalid priority "${rawPriority}". Valid: ${[...VALID_PRIORITIES].join(", ")}`
    );
  }

  const filePath = resolveTicketsFilePath();
  const all = await loadTickets(filePath);
  const now = new Date().toISOString();

  const ticket: TicketRecord = {
    id: randomUUID(),
    title,
    status: TICKET_STATUSES.Open,
    priority: rawPriority as TicketPriority,
    createdAt: now,
    updatedAt: now,
    ...((values.desc ?? values.description)
      ? { description: (values.desc ?? values.description)! }
      : {}),
    ...(values.assign ? { assigneeAgentId: values.assign } : {}),
  };

  await persistTickets(filePath, [...all, ticket]);

  if (mode.json) {
    writeJson({ ok: true, ticket });
    return 0;
  }
  writeLine(`Created: ${ticket.id.slice(0, 8)} — ${ticket.title}`);
  writeLine(`  status:   ${ticket.status}`);
  writeLine(`  priority: ${ticket.priority}`);
  if (ticket.assigneeAgentId) writeLine(`  assignee: ${ticket.assigneeAgentId}`);
  return 0;
}

// ---------------------------------------------------------------------------
// Subcommand: assign
// ---------------------------------------------------------------------------

async function runKanbanAssign(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseFlags<{
    agent?: string;
    json?: boolean;
    pretty?: boolean;
  }>(argv, {
    agent: { type: "string" },
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });

  const mode = resolveOutputMode(values);
  const ticketId = positionals[0];
  if (!ticketId) throw new UsageError("Usage: cp kanban assign <ticketId> --agent <agentId>");
  if (!values.agent) throw new UsageError("--agent <agentId> is required");

  const filePath = resolveTicketsFilePath();
  const all = await loadTickets(filePath);
  const idx = all.findIndex((t) => t.id === ticketId || t.id.startsWith(ticketId));
  if (idx === -1) throw new UsageError(`Ticket not found: ${ticketId}`);

  const updated: TicketRecord = {
    ...all[idx]!,
    assigneeAgentId: values.agent,
    updatedAt: new Date().toISOString(),
  };
  const next = [...all];
  next[idx] = updated;
  await persistTickets(filePath, next);

  if (mode.json) {
    writeJson({ ok: true, ticket: updated });
    return 0;
  }
  writeLine(`Assigned ${updated.id.slice(0, 8)} to ${updated.assigneeAgentId}`);
  return 0;
}

// ---------------------------------------------------------------------------
// Subcommand: move
// ---------------------------------------------------------------------------

async function runKanbanMove(argv: readonly string[]): Promise<number> {
  const { positionals, values } = parseFlags<{
    status?: string;
    json?: boolean;
    pretty?: boolean;
  }>(argv, {
    status: { type: "string" },
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });

  const mode = resolveOutputMode(values);
  const ticketId = positionals[0];
  if (!ticketId) throw new UsageError("Usage: cp kanban move <ticketId> --status <ticketStatus>");
  if (!values.status) throw new UsageError("--status is required");
  if (!VALID_STATUSES.has(values.status)) {
    throw new UsageError(
      `Invalid status "${values.status}". Valid: ${[...VALID_STATUSES].join(", ")}`
    );
  }

  const newStatus = values.status as TicketStatus;
  const filePath = resolveTicketsFilePath();
  const all = await loadTickets(filePath);
  const idx = all.findIndex((t) => t.id === ticketId || t.id.startsWith(ticketId));
  if (idx === -1) throw new UsageError(`Ticket not found: ${ticketId}`);

  const current = all[idx]!;
  const previousStatus = current.status;
  const updated: TicketRecord = {
    ...current,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };
  const next = [...all];
  next[idx] = updated;
  await persistTickets(filePath, next);

  // Fire wake webhook if status changed and ticket has an assignee
  if (newStatus !== previousStatus && updated.assigneeAgentId) {
    await fireWakeWebhook(updated.id, updated.assigneeAgentId, previousStatus, newStatus);
  }

  if (mode.json) {
    writeJson({ ok: true, ticket: updated });
    return 0;
  }
  writeLine(`Moved ${updated.id.slice(0, 8)} → ${updated.status}`);
  return 0;
}

// ---------------------------------------------------------------------------
// Top-level dispatcher
// ---------------------------------------------------------------------------

export async function runKanban(sub: string | undefined, argv: readonly string[]): Promise<number> {
  switch (sub) {
    case "list":
      return runKanbanList(argv);
    case "create":
      return runKanbanCreate(argv);
    case "assign":
      return runKanbanAssign(argv);
    case "move":
      return runKanbanMove(argv);
    default:
      throw new UsageError(
        `Unknown kanban subcommand: ${sub ?? "(none)"}. Try \`list\`, \`create\`, \`assign\`, or \`move\`.`
      );
  }
}

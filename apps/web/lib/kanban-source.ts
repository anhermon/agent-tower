import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";

import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketRecord,
  type TicketStatus,
} from "@control-plane/core";

export {
  groupTicketsByStatus,
  KANBAN_LANE_LABELS,
  KANBAN_LANE_ORDER,
} from "./kanban-utils";

/**
 * Read-only local-filesystem adapter for the Kanban module.
 *
 * Resolution order for the ticket source file:
 *   1. `CLAUDE_CONTROL_PLANE_TICKETS_FILE` env var (explicit path).
 *   2. `null` → UI renders an unconfigured empty state.
 *
 * The file is expected to contain canonical {@link TicketRecord} records,
 * encoded as either:
 *   - A JSON array of records, or
 *   - JSONL — one record per non-empty line.
 *
 * There is no fallback, no seeded data, and no writes. If the file is missing
 * or malformed the source returns a typed error result and the UI renders
 * a degraded state. Mock data lives in the accompanying test file only.
 */

export const TICKETS_FILE_ENV = "CLAUDE_CONTROL_PLANE_TICKETS_FILE";

export interface ResolvedTicketsFile {
  readonly filePath: string;
  readonly origin: "env";
}

export type ListTicketsResult =
  | {
      readonly ok: true;
      readonly tickets: readonly TicketRecord[];
      readonly source: ResolvedTicketsFile;
    }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "error";
      readonly message?: string;
    };

export type LoadTicketResult =
  | { readonly ok: true; readonly ticket: TicketRecord; readonly source: ResolvedTicketsFile }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "not_found" | "error";
      readonly message?: string;
    };

export function resolveTicketsFile(): ResolvedTicketsFile | null {
  const raw = process.env[TICKETS_FILE_ENV];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return { filePath: trimmed, origin: "env" };
}

export function getConfiguredTicketsFile(): string | null {
  return resolveTicketsFile()?.filePath ?? null;
}

export async function listTicketsOrEmpty(): Promise<ListTicketsResult> {
  const resolved = resolveTicketsFile();
  if (!resolved) {
    return { ok: false, reason: "unconfigured" };
  }

  if (!existsFile(resolved.filePath)) {
    return {
      ok: false,
      reason: "error",
      message: `Tickets file not found at ${resolved.filePath}.`,
    };
  }

  try {
    const raw = await readFile(resolved.filePath, "utf8");
    const parsed = parseTicketsFile(raw);
    const tickets = parsed.map(validateTicket);
    return { ok: true, tickets, source: resolved };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

export async function loadTicketOrUndefined(id: string): Promise<LoadTicketResult> {
  const list = await listTicketsOrEmpty();
  if (!list.ok) return list;
  const match = list.tickets.find((ticket) => ticket.id === id);
  if (!match) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, ticket: match, source: list.source };
}

function existsFile(target: string): boolean {
  try {
    return existsSync(target) && statSync(target).isFile();
  } catch {
    return false;
  }
}

function parseTicketsFile(raw: string): readonly unknown[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  // JSON array if the first non-whitespace character is `[`.
  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isUnknownArray(parsed)) {
      throw new Error("Tickets JSON must be an array of TicketRecord objects.");
    }
    return parsed;
  }

  // Otherwise treat each non-empty line as one JSON object (JSONL).
  const records: unknown[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (line.length === 0) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Malformed ticket JSONL on line ${i + 1}: ${errorMessage(error)}`);
    }
  }
  return records;
}

const TICKET_STATUS_VALUES: readonly string[] = Object.values(TICKET_STATUSES);
const TICKET_PRIORITY_VALUES: readonly string[] = Object.values(TICKET_PRIORITIES);

function validateTicket(input: unknown): TicketRecord {
  if (!isRecord(input)) {
    throw new Error("Each ticket entry must be a JSON object.");
  }
  const id = requireString(input, "id");
  const title = requireString(input, "title");
  const status = requireString(input, "status");
  const priority = requireString(input, "priority");
  const createdAt = requireString(input, "createdAt");
  const updatedAt = requireString(input, "updatedAt");

  if (!TICKET_STATUS_VALUES.includes(status)) {
    throw new Error(
      `Ticket ${id} has unknown status "${status}". Expected one of ${TICKET_STATUS_VALUES.join(", ")}.`
    );
  }
  if (!TICKET_PRIORITY_VALUES.includes(priority)) {
    throw new Error(
      `Ticket ${id} has unknown priority "${priority}". Expected one of ${TICKET_PRIORITY_VALUES.join(", ")}.`
    );
  }

  const ticket: TicketRecord = {
    id,
    title,
    status: status as TicketStatus,
    priority: priority as TicketPriority,
    createdAt,
    updatedAt,
    ...(optionalString(input, "description") !== null
      ? { description: optionalString(input, "description")! }
      : {}),
    ...(optionalString(input, "assigneeAgentId") !== null
      ? { assigneeAgentId: optionalString(input, "assigneeAgentId")! }
      : {}),
    ...(optionalString(input, "sessionId") !== null
      ? { sessionId: optionalString(input, "sessionId")! }
      : {}),
    ...(optionalString(input, "externalUrl") !== null
      ? { externalUrl: optionalString(input, "externalUrl")! }
      : {}),
    ...(isRecord(input.metadata) ? { metadata: input.metadata as TicketRecord["metadata"] } : {}),
  };
  return ticket;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Ticket is missing required string field "${field}".`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

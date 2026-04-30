import "server-only";

import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketRecord,
  type TicketStatus,
  type AgentWakeAdapter,
} from "@control-plane/core";

import { resolveTicketsFile } from "./kanban-source";
import { resolveWakeAdapter } from "./kanban-wake";

export { TICKETS_FILE_ENV } from "./kanban-source";

/**
 * Local file-backed kanban store.
 *
 * Reads tickets from the file pointed at by CLAUDE_CONTROL_PLANE_TICKETS_FILE.
 * Mutations (create, update) rewrite the entire file as a JSON array so that
 * random-access updates are possible without append-only constraints.
 *
 * This module is server-only — never import it from client components.
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type StoreListResult =
  | { readonly ok: true; readonly tickets: readonly TicketRecord[] }
  | { readonly ok: false; readonly reason: "unconfigured" | "error"; readonly message?: string };

export type StoreMutationResult =
  | { readonly ok: true; readonly ticket: TicketRecord }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "not_found" | "error";
      readonly message?: string;
    };

// ---------------------------------------------------------------------------
// Create input
// ---------------------------------------------------------------------------

export interface CreateTicketInput {
  readonly title: string;
  readonly description?: string;
  readonly priority?: TicketPriority;
  readonly assigneeAgentId?: string;
}

// ---------------------------------------------------------------------------
// Read — delegates to kanban-source file parser
// ---------------------------------------------------------------------------

export async function listTickets(): Promise<StoreListResult> {
  const resolved = resolveTicketsFile();
  if (!resolved) {
    return { ok: false, reason: "unconfigured" };
  }

  if (!fileExists(resolved.filePath)) {
    // If the file doesn't exist yet (first write will create it), return empty
    return { ok: true, tickets: [] };
  }

  try {
    const raw = await readFile(resolved.filePath, "utf8");
    const tickets = parseTicketFile(raw);
    return { ok: true, tickets };
  } catch (error) {
    return { ok: false, reason: "error", message: errMsg(error) };
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTicket(input: CreateTicketInput): Promise<StoreMutationResult> {
  const resolved = resolveTicketsFile();
  if (!resolved) return { ok: false, reason: "unconfigured" };

  try {
    const existing = await loadAll(resolved.filePath);
    const now = new Date().toISOString();
    const ticket: TicketRecord = {
      id: randomUUID(),
      title: input.title.trim(),
      status: TICKET_STATUSES.Open,
      priority: input.priority ?? TICKET_PRIORITIES.Normal,
      createdAt: now,
      updatedAt: now,
      ...(input.description ? { description: input.description } : {}),
      ...(input.assigneeAgentId ? { assigneeAgentId: input.assigneeAgentId } : {}),
    };
    await persist(resolved.filePath, [...existing, ticket]);
    return { ok: true, ticket };
  } catch (error) {
    return { ok: false, reason: "error", message: errMsg(error) };
  }
}

// ---------------------------------------------------------------------------
// Update (assign + move)
// ---------------------------------------------------------------------------

export interface UpdateTicketInput {
  readonly status?: TicketStatus;
  readonly assigneeAgentId?: string;
  readonly priority?: TicketPriority;
}

export async function updateTicket(
  id: string,
  patch: UpdateTicketInput,
  wakeAdapter?: AgentWakeAdapter
): Promise<StoreMutationResult> {
  const resolved = resolveTicketsFile();
  if (!resolved) return { ok: false, reason: "unconfigured" };

  try {
    const all = await loadAll(resolved.filePath);
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1) return { ok: false, reason: "not_found" };

    const current = all[idx];
    const previousStatus = current.status;
    const now = new Date().toISOString();

    const updated: TicketRecord = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.assigneeAgentId !== undefined ? { assigneeAgentId: patch.assigneeAgentId } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      updatedAt: now,
    };

    const next = [...all];
    next[idx] = updated;
    await persist(resolved.filePath, next);

    // Fire agent wake if status changed and ticket has an assignee
    const newStatus = updated.status;
    if (patch.status !== undefined && newStatus !== previousStatus && updated.assigneeAgentId) {
      const adapter = wakeAdapter ?? resolveWakeAdapter();
      await adapter
        .wake({
          ticketId: updated.id,
          assigneeAgentId: updated.assigneeAgentId,
          previousStatus,
          newStatus,
          triggeredAt: now,
        })
        .catch(() => {
          // Wake failures must never break ticket mutation
        });
    }

    return { ok: true, ticket: updated };
  } catch (error) {
    return { ok: false, reason: "error", message: errMsg(error) };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fileExists(filePath: string): boolean {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

async function loadAll(filePath: string): Promise<TicketRecord[]> {
  if (!fileExists(filePath)) return [];
  const raw = await readFile(filePath, "utf8");
  return [...parseTicketFile(raw)];
}

async function persist(filePath: string, tickets: readonly TicketRecord[]): Promise<void> {
  await writeFile(filePath, JSON.stringify(tickets, null, 2) + "\n", "utf8");
}

/** Parse JSON array or JSONL into TicketRecord[]. Validates minimally. */
function parseTicketFile(raw: string): readonly TicketRecord[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  const parsed: unknown = trimmed.startsWith("[")
    ? JSON.parse(trimmed)
    : trimmed
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as unknown);

  if (!Array.isArray(parsed)) return [];

  return (parsed as unknown[]).map((entry, i) => {
    if (!isObject(entry)) throw new Error(`Ticket at index ${i} is not an object`);
    const r = entry;
    return {
      id: requireStr(r, "id"),
      title: requireStr(r, "title"),
      status: requireStr(r, "status") as TicketStatus,
      priority: requireStr(r, "priority") as TicketPriority,
      createdAt: requireStr(r, "createdAt"),
      updatedAt: requireStr(r, "updatedAt"),
      ...(typeof r.description === "string" && r.description ? { description: r.description } : {}),
      ...(typeof r.assigneeAgentId === "string" && r.assigneeAgentId
        ? { assigneeAgentId: r.assigneeAgentId }
        : {}),
      ...(typeof r.sessionId === "string" && r.sessionId ? { sessionId: r.sessionId } : {}),
      ...(typeof r.externalUrl === "string" && r.externalUrl ? { externalUrl: r.externalUrl } : {}),
    } satisfies TicketRecord;
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireStr(r: Record<string, unknown>, key: string): string {
  const v = r[key];
  if (typeof v !== "string" || v.length === 0)
    throw new Error(`Ticket missing required field "${key}"`);
  return v;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

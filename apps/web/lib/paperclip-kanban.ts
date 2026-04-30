/**
 * Paperclip API client for the Kanban module.
 *
 * Server-side only — reads PAPERCLIP_API_KEY / PAPERCLIP_API_URL / PAPERCLIP_COMPANY_ID
 * from the environment and proxies Paperclip issue CRUD operations, mapping them to
 * the canonical TicketRecord / TicketStatus domain types.
 *
 * This module is intentionally self-contained: it does not import from
 * adapter-claude-code and does not touch the filesystem.
 */

import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketRecord,
  type TicketStatus,
} from "@control-plane/core";

// ---------------------------------------------------------------------------
// Environment resolution
// ---------------------------------------------------------------------------

export interface PaperclipEnv {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly companyId: string;
  readonly projectId: string | null;
}

export type PaperclipEnvResult =
  | { readonly ok: true; readonly env: PaperclipEnv }
  | { readonly ok: false; readonly reason: string };

export function resolvePaperclipEnv(): PaperclipEnvResult {
  const apiUrl = process.env.PAPERCLIP_API_URL?.trim();
  const apiKey = process.env.PAPERCLIP_API_KEY?.trim();
  const companyId = process.env.PAPERCLIP_COMPANY_ID?.trim();
  const projectId = process.env.PAPERCLIP_PROJECT_ID?.trim() ?? null;

  if (!apiUrl) return { ok: false, reason: "PAPERCLIP_API_URL is not set" };
  if (!apiKey) return { ok: false, reason: "PAPERCLIP_API_KEY is not set" };
  if (!companyId) return { ok: false, reason: "PAPERCLIP_COMPANY_ID is not set" };

  return { ok: true, env: { apiUrl, apiKey, companyId, projectId: projectId ?? null } };
}

export function isPaperclipConfigured(): boolean {
  return resolvePaperclipEnv().ok;
}

// ---------------------------------------------------------------------------
// Status / priority mappings
// ---------------------------------------------------------------------------

const PAPERCLIP_TO_TICKET_STATUS: Record<string, TicketStatus> = {
  todo: TICKET_STATUSES.Open,
  in_progress: TICKET_STATUSES.InProgress,
  in_review: TICKET_STATUSES.InProgress,
  blocked: TICKET_STATUSES.Blocked,
  done: TICKET_STATUSES.Resolved,
  cancelled: TICKET_STATUSES.Closed,
};

const TICKET_STATUS_TO_PAPERCLIP: Record<TicketStatus, string> = {
  [TICKET_STATUSES.Open]: "todo",
  [TICKET_STATUSES.InProgress]: "in_progress",
  [TICKET_STATUSES.Blocked]: "blocked",
  [TICKET_STATUSES.Resolved]: "done",
  [TICKET_STATUSES.Closed]: "cancelled",
};

const PAPERCLIP_TO_TICKET_PRIORITY: Record<string, TicketPriority> = {
  low: TICKET_PRIORITIES.Low,
  medium: TICKET_PRIORITIES.Normal,
  high: TICKET_PRIORITIES.High,
  critical: TICKET_PRIORITIES.Urgent,
  urgent: TICKET_PRIORITIES.Urgent,
};

const TICKET_PRIORITY_TO_PAPERCLIP: Record<TicketPriority, string> = {
  [TICKET_PRIORITIES.Low]: "low",
  [TICKET_PRIORITIES.Normal]: "medium",
  [TICKET_PRIORITIES.High]: "high",
  [TICKET_PRIORITIES.Urgent]: "urgent",
};

function mapStatus(paperclipStatus: string): TicketStatus {
  return PAPERCLIP_TO_TICKET_STATUS[paperclipStatus] ?? TICKET_STATUSES.Open;
}

function mapPriority(paperclipPriority: string): TicketPriority {
  return PAPERCLIP_TO_TICKET_PRIORITY[paperclipPriority] ?? TICKET_PRIORITIES.Normal;
}

// ---------------------------------------------------------------------------
// Paperclip issue shape (partial — only what we need)
// ---------------------------------------------------------------------------

interface PaperclipIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly description?: string;
  readonly status: string;
  readonly priority: string;
  readonly assigneeAgentId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toTicketRecord(issue: PaperclipIssue): TicketRecord {
  const ticket: TicketRecord = {
    id: issue.identifier,
    title: issue.title,
    status: mapStatus(issue.status),
    priority: mapPriority(issue.priority),
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    metadata: { paperclipId: issue.id },
  };
  if (issue.description) {
    return { ...ticket, description: issue.description };
  }
  if (issue.assigneeAgentId) {
    return { ...ticket, assigneeAgentId: issue.assigneeAgentId };
  }
  if (issue.description && issue.assigneeAgentId) {
    return { ...ticket, description: issue.description, assigneeAgentId: issue.assigneeAgentId };
  }
  return ticket;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function paperclipFetch(
  env: PaperclipEnv,
  path: string,
  options?: RequestInit
): Promise<unknown> {
  const url = `${env.apiUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Paperclip API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Agent info type
// ---------------------------------------------------------------------------

export interface PaperclipAgentInfo {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly status: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ListTicketsResult =
  | { readonly ok: true; readonly tickets: readonly TicketRecord[] }
  | { readonly ok: false; readonly reason: "unconfigured" | "error"; readonly message?: string };

export type TicketMutationResult =
  | { readonly ok: true; readonly ticket: TicketRecord }
  | { readonly ok: false; readonly reason: "unconfigured" | "error"; readonly message?: string };

export type ListAgentsResult =
  | { readonly ok: true; readonly agents: readonly PaperclipAgentInfo[] }
  | { readonly ok: false; readonly reason: "unconfigured" | "error"; readonly message?: string };

export async function listPaperclipTickets(projectId?: string): Promise<ListTicketsResult> {
  const envResult = resolvePaperclipEnv();
  if (!envResult.ok) return { ok: false, reason: "unconfigured", message: envResult.reason };

  try {
    const { env } = envResult;
    const resolvedProject = projectId ?? env.projectId;
    let path = `/api/companies/${env.companyId}/issues?limit=200`;
    if (resolvedProject) path += `&projectId=${resolvedProject}`;

    const data = (await paperclipFetch(env, path)) as readonly PaperclipIssue[];
    const tickets = (Array.isArray(data) ? data : []).map(toTicketRecord);
    return { ok: true, tickets };
  } catch (error) {
    return { ok: false, reason: "error", message: errMsg(error) };
  }
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description?: string;
  readonly priority?: TicketPriority;
  readonly assigneeAgentId?: string;
  readonly projectId?: string;
}

export async function createPaperclipTicket(
  input: CreateTicketInput
): Promise<TicketMutationResult> {
  const envResult = resolvePaperclipEnv();
  if (!envResult.ok) return { ok: false, reason: "unconfigured", message: envResult.reason };

  try {
    const { env } = envResult;
    const resolvedProject = input.projectId ?? env.projectId;
    const body: Record<string, unknown> = {
      title: input.title,
      status: "todo",
      priority: TICKET_PRIORITY_TO_PAPERCLIP[input.priority ?? TICKET_PRIORITIES.Normal],
    };
    if (input.description) body.description = input.description;
    if (input.assigneeAgentId) body.assigneeAgentId = input.assigneeAgentId;
    if (resolvedProject) body.projectId = resolvedProject;

    const data = (await paperclipFetch(env, `/api/companies/${env.companyId}/issues`, {
      method: "POST",
      body: JSON.stringify(body),
    })) as PaperclipIssue;

    return { ok: true, ticket: toTicketRecord(data) };
  } catch (error) {
    return { ok: false, reason: "error", message: errMsg(error) };
  }
}

export async function assignPaperclipTicket(
  issueId: string,
  agentId: string
): Promise<TicketMutationResult> {
  const envResult = resolvePaperclipEnv();
  if (!envResult.ok) return { ok: false, reason: "unconfigured", message: envResult.reason };

  try {
    const { env } = envResult;
    // issueId may be a Paperclip identifier (ANGA-1014) or UUID; resolve to UUID if needed
    const resolvedId = await resolveIssueId(env, issueId);
    const data = (await paperclipFetch(env, `/api/issues/${resolvedId}`, {
      method: "PATCH",
      body: JSON.stringify({ assigneeAgentId: agentId }),
    })) as PaperclipIssue;

    return { ok: true, ticket: toTicketRecord(data) };
  } catch (error) {
    return { ok: false, reason: "error", message: errMsg(error) };
  }
}

export async function movePaperclipTicket(
  issueId: string,
  status: TicketStatus
): Promise<TicketMutationResult> {
  const envResult = resolvePaperclipEnv();
  if (!envResult.ok) return { ok: false, reason: "unconfigured", message: envResult.reason };

  try {
    const { env } = envResult;
    const resolvedId = await resolveIssueId(env, issueId);
    const paperclipStatus = TICKET_STATUS_TO_PAPERCLIP[status];
    const data = (await paperclipFetch(env, `/api/issues/${resolvedId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: paperclipStatus }),
    })) as PaperclipIssue;

    return { ok: true, ticket: toTicketRecord(data) };
  } catch (error) {
    return { ok: false, reason: "error", message: errMsg(error) };
  }
}

export async function listPaperclipAgents(): Promise<ListAgentsResult> {
  const envResult = resolvePaperclipEnv();
  if (!envResult.ok) return { ok: false, reason: "unconfigured", message: envResult.reason };

  try {
    const { env } = envResult;
    const data = await paperclipFetch(env, `/api/companies/${env.companyId}/agents?limit=100`);
    const raw = Array.isArray(data) ? (data as readonly Record<string, unknown>[]) : [];
    const agents = raw.map((a) => ({
      id: typeof a.id === "string" ? a.id : "",
      name: typeof a.name === "string" ? a.name : "",
      role: typeof a.role === "string" ? a.role : "",
      status: typeof a.status === "string" ? a.status : "",
    }));
    return { ok: true, agents };
  } catch (error) {
    return { ok: false, reason: "error", message: errMsg(error) };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve a Paperclip identifier (e.g. "ANGA-1014") or UUID to a UUID. */
async function resolveIssueId(env: PaperclipEnv, issueId: string): Promise<string> {
  // UUID pattern — already a UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issueId)) {
    return issueId;
  }
  // Otherwise treat as identifier and fetch to get UUID
  const data = (await paperclipFetch(
    env,
    `/api/issues/${encodeURIComponent(issueId)}`
  )) as PaperclipIssue;
  return data.id;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Re-export status/priority maps for CLI/MCP consumers
// ---------------------------------------------------------------------------
export {
  TICKET_STATUS_TO_PAPERCLIP,
  PAPERCLIP_TO_TICKET_STATUS,
  TICKET_PRIORITY_TO_PAPERCLIP,
  PAPERCLIP_TO_TICKET_PRIORITY,
};

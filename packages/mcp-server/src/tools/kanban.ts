/**
 * MCP tools for the interactive Paperclip kanban control plane.
 *
 * Four tools:
 *   kanban_list   — list Paperclip issues as canonical TicketRecords
 *   kanban_create — create a new Paperclip issue
 *   kanban_assign — assign a Paperclip agent to an issue
 *   kanban_move   — move an issue to a new lane (status), waking the agent
 *
 * Requires: PAPERCLIP_API_KEY, PAPERCLIP_API_URL, PAPERCLIP_COMPANY_ID
 */

import { type TicketPriority, type TicketRecord, type TicketStatus , TICKET_PRIORITIES, TICKET_STATUSES } from "@control-plane/core";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// Paperclip env + HTTP helpers (self-contained — no web dep)
// ---------------------------------------------------------------------------

interface PaperclipEnv {
  apiUrl: string;
  apiKey: string;
  companyId: string;
  projectId: string | null;
}

function getPaperclipEnv(): PaperclipEnv | null {
  const apiUrl = process.env.PAPERCLIP_API_URL?.trim();
  const apiKey = process.env.PAPERCLIP_API_KEY?.trim();
  const companyId = process.env.PAPERCLIP_COMPANY_ID?.trim();
  const projectId = process.env.PAPERCLIP_PROJECT_ID?.trim() ?? null;
  if (!apiUrl || !apiKey || !companyId) return null;
  return { apiUrl, apiKey, companyId, projectId };
}

async function pcFetch(env: PaperclipEnv, path: string, opts?: RequestInit): Promise<unknown> {
  const url = `${env.apiUrl}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Content-Type": "application/json",
      ...(opts?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Paperclip API ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

const TO_TICKET_STATUS: Record<string, TicketStatus> = {
  todo: TICKET_STATUSES.Open,
  in_progress: TICKET_STATUSES.InProgress,
  in_review: TICKET_STATUSES.InProgress,
  blocked: TICKET_STATUSES.Blocked,
  done: TICKET_STATUSES.Resolved,
  cancelled: TICKET_STATUSES.Closed,
};

const TO_PAPERCLIP_STATUS: Record<TicketStatus, string> = {
  [TICKET_STATUSES.Open]: "todo",
  [TICKET_STATUSES.InProgress]: "in_progress",
  [TICKET_STATUSES.Blocked]: "blocked",
  [TICKET_STATUSES.Resolved]: "done",
  [TICKET_STATUSES.Closed]: "cancelled",
};

const TO_TICKET_PRIORITY: Record<string, TicketPriority> = {
  low: TICKET_PRIORITIES.Low,
  medium: TICKET_PRIORITIES.Normal,
  high: TICKET_PRIORITIES.High,
  critical: TICKET_PRIORITIES.Urgent,
  urgent: TICKET_PRIORITIES.Urgent,
};

const TO_PAPERCLIP_PRIORITY: Record<TicketPriority, string> = {
  [TICKET_PRIORITIES.Low]: "low",
  [TICKET_PRIORITIES.Normal]: "medium",
  [TICKET_PRIORITIES.High]: "high",
  [TICKET_PRIORITIES.Urgent]: "urgent",
};

interface RawIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeAgentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

function toTicket(issue: RawIssue): TicketRecord {
  const base: TicketRecord = {
    id: issue.identifier,
    title: issue.title,
    status: TO_TICKET_STATUS[issue.status] ?? TICKET_STATUSES.Open,
    priority: TO_TICKET_PRIORITY[issue.priority] ?? TICKET_PRIORITIES.Normal,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    metadata: { paperclipId: issue.id },
  };
  if (issue.description && issue.assigneeAgentId) {
    return { ...base, description: issue.description, assigneeAgentId: issue.assigneeAgentId };
  }
  if (issue.description) return { ...base, description: issue.description };
  if (issue.assigneeAgentId) return { ...base, assigneeAgentId: issue.assigneeAgentId };
  return base;
}

async function resolveId(env: PaperclipEnv, issueId: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issueId)) {
    return issueId;
  }
  const data = (await pcFetch(env, `/api/issues/${encodeURIComponent(issueId)}`)) as RawIssue;
  return data.id;
}

const UNCONFIGURED_RESULT: ToolResult = {
  ok: false,
  reason: "unconfigured",
  message: "PAPERCLIP_API_KEY / PAPERCLIP_API_URL / PAPERCLIP_COMPANY_ID are not set",
};

// ---------------------------------------------------------------------------
// kanban_list
// ---------------------------------------------------------------------------

export const kanbanListTool: ToolDefinition = {
  name: "kanban_list",
  description:
    "List Paperclip issues as canonical TicketRecord objects. Optionally filter by project. Returns id (identifier), title, status, priority, assigneeAgentId, createdAt, updatedAt.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "Paperclip project UUID to filter by (optional)" },
    },
    additionalProperties: false,
  },
  handler: async (input: unknown): Promise<ToolResult> => {
    const env = getPaperclipEnv();
    if (!env) return UNCONFIGURED_RESULT;

    try {
      const params = asRecord(input);
      const projectId =
        typeof params.projectId === "string" ? params.projectId : env.projectId;
      let path = `/api/companies/${env.companyId}/issues?limit=200`;
      if (projectId) path += `&projectId=${projectId}`;

      const data = (await pcFetch(env, path)) as readonly RawIssue[];
      const tickets = (Array.isArray(data) ? data : []).map(toTicket);
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
    "Create a new Paperclip issue (ticket). Returns the created TicketRecord. Moving the ticket immediately to a status other than open is not supported on creation — use kanban_move after.",
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
        description: "Paperclip agent UUID to assign. The agent is woken on assignment.",
      },
      projectId: {
        type: "string",
        description: "Paperclip project UUID. Falls back to PAPERCLIP_PROJECT_ID env var.",
      },
    },
    required: ["title"],
    additionalProperties: false,
  },
  handler: async (input: unknown): Promise<ToolResult> => {
    const env = getPaperclipEnv();
    if (!env) return UNCONFIGURED_RESULT;

    try {
      const params = asRecord(input);
      const title = params.title;
      if (typeof title !== "string" || title.trim().length === 0) {
        return { ok: false, reason: "bad_input", message: "title is required" };
      }

      const rawPriority = params.priority;
      const priority: TicketPriority =
        typeof rawPriority === "string" && rawPriority in TO_PAPERCLIP_PRIORITY
          ? (rawPriority as TicketPriority)
          : TICKET_PRIORITIES.Normal;

      const projectId =
        typeof params.projectId === "string" ? params.projectId : env.projectId;

      const body: Record<string, unknown> = {
        title: title.trim(),
        status: "todo",
        priority: TO_PAPERCLIP_PRIORITY[priority],
      };
      if (typeof params.description === "string") body.description = params.description;
      if (typeof params.assigneeAgentId === "string") {
        body.assigneeAgentId = params.assigneeAgentId;
      }
      if (projectId) body.projectId = projectId;

      const data = (await pcFetch(env, `/api/companies/${env.companyId}/issues`, {
        method: "POST",
        body: JSON.stringify(body),
      })) as RawIssue;

      return { ok: true, ticket: toTicket(data) };
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
    "Assign a Paperclip agent to an existing issue. Wakes the agent via Paperclip. issueId may be a Paperclip identifier (e.g. ANGA-1014) or a UUID.",
  inputSchema: {
    type: "object",
    properties: {
      issueId: { type: "string", description: "Paperclip issue identifier (ANGA-NNN) or UUID" },
      agentId: { type: "string", description: "Paperclip agent UUID to assign" },
    },
    required: ["issueId", "agentId"],
    additionalProperties: false,
  },
  handler: async (input: unknown): Promise<ToolResult> => {
    const env = getPaperclipEnv();
    if (!env) return UNCONFIGURED_RESULT;

    try {
      const params = asRecord(input);
      const issueId = params.issueId;
      const agentId = params.agentId;
      if (typeof issueId !== "string" || !issueId.trim()) {
        return { ok: false, reason: "bad_input", message: "issueId is required" };
      }
      if (typeof agentId !== "string" || !agentId.trim()) {
        return { ok: false, reason: "bad_input", message: "agentId is required" };
      }

      const resolvedId = await resolveId(env, issueId.trim());
      const data = (await pcFetch(env, `/api/issues/${resolvedId}`, {
        method: "PATCH",
        body: JSON.stringify({ assigneeAgentId: agentId.trim() }),
      })) as RawIssue;

      return { ok: true, ticket: toTicket(data) };
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
    "Move a Paperclip issue to a new lane (status). Moving to 'resolved' sets the Paperclip status to 'done'; 'closed' sets it to 'cancelled'. The assigned agent is woken when the issue is moved to in_progress. issueId may be a Paperclip identifier or UUID.",
  inputSchema: {
    type: "object",
    properties: {
      issueId: { type: "string", description: "Paperclip issue identifier (ANGA-NNN) or UUID" },
      status: {
        type: "string",
        enum: Object.values(TICKET_STATUSES),
        description: "Target TicketStatus lane",
      },
    },
    required: ["issueId", "status"],
    additionalProperties: false,
  },
  handler: async (input: unknown): Promise<ToolResult> => {
    const env = getPaperclipEnv();
    if (!env) return UNCONFIGURED_RESULT;

    try {
      const params = asRecord(input);
      const issueId = params.issueId;
      const status = params.status;
      if (typeof issueId !== "string" || !issueId.trim()) {
        return { ok: false, reason: "bad_input", message: "issueId is required" };
      }
      if (typeof status !== "string" || !(status in TO_PAPERCLIP_STATUS)) {
        return {
          ok: false,
          reason: "bad_input",
          message: `status must be one of: ${Object.values(TICKET_STATUSES).join(", ")}`,
        };
      }

      const ticketStatus = status as TicketStatus;
      const paperclipStatus = TO_PAPERCLIP_STATUS[ticketStatus];
      const resolvedId = await resolveId(env, issueId.trim());

      const data = (await pcFetch(env, `/api/issues/${resolvedId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: paperclipStatus }),
      })) as RawIssue;

      return { ok: true, ticket: toTicket(data) };
    } catch (error) {
      return errorResult(error);
    }
  },
};

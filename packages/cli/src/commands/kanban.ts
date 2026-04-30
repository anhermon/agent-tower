/**
 * cp kanban — Interactive Paperclip kanban management CLI.
 *
 * Subcommands:
 *   list   [--project <id>]                        List Paperclip issues as canonical tickets
 *   create --title <t> [--desc <d>] [--priority p] [--assign <agentId>] [--project <id>]
 *   assign <issueId> --agent <agentId>
 *   move   <issueId> --status <ticketStatus>
 *
 * Requires: PAPERCLIP_API_KEY, PAPERCLIP_API_URL, PAPERCLIP_COMPANY_ID
 */

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
// Paperclip env resolution (duplicates the web lib; CLI has no dep on Next.js)
// ---------------------------------------------------------------------------

interface PaperclipEnv {
  apiUrl: string;
  apiKey: string;
  companyId: string;
  projectId: string | null;
}

function resolvePaperclipEnv(): PaperclipEnv {
  const apiUrl = process.env.PAPERCLIP_API_URL?.trim();
  const apiKey = process.env.PAPERCLIP_API_KEY?.trim();
  const companyId = process.env.PAPERCLIP_COMPANY_ID?.trim();
  const projectId = process.env.PAPERCLIP_PROJECT_ID?.trim() ?? null;

  if (!apiUrl) throw new UsageError("PAPERCLIP_API_URL is not set");
  if (!apiKey) throw new UsageError("PAPERCLIP_API_KEY is not set");
  if (!companyId) throw new UsageError("PAPERCLIP_COMPANY_ID is not set");

  return { apiUrl, apiKey, companyId, projectId };
}

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
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Paperclip API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
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

const VALID_STATUSES = new Set<string>(Object.values(TICKET_STATUSES));
const VALID_PRIORITIES = new Set<string>(Object.values(TICKET_PRIORITIES));

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
    status: PAPERCLIP_TO_TICKET_STATUS[issue.status] ?? TICKET_STATUSES.Open,
    priority: PAPERCLIP_TO_TICKET_PRIORITY[issue.priority] ?? TICKET_PRIORITIES.Normal,
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

async function resolveIssueId(env: PaperclipEnv, issueId: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issueId)) {
    return issueId;
  }
  const data = (await paperclipFetch(
    env,
    `/api/issues/${encodeURIComponent(issueId)}`
  )) as RawIssue;
  return data.id;
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function runKanbanList(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{ project?: string; json?: boolean; pretty?: boolean }>(argv, {
    project: { type: "string" },
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });
  const mode = resolveOutputMode(values);
  const env = resolvePaperclipEnv();
  const projectId = values.project ?? env.projectId;

  let path = `/api/companies/${env.companyId}/issues?limit=200`;
  if (projectId) path += `&projectId=${projectId}`;

  const data = (await paperclipFetch(env, path)) as readonly RawIssue[];
  const tickets = (Array.isArray(data) ? data : []).map(toTicket);

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
    t.id,
    t.status,
    t.priority,
    t.title.slice(0, 50),
    t.assigneeAgentId?.slice(0, 20) ?? "—",
  ]);
  writeLine(renderTable(["id", "status", "priority", "title", "assignee"], rows));
  return 0;
}

async function runKanbanCreate(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    title?: string;
    desc?: string;
    description?: string;
    priority?: string;
    assign?: string;
    project?: string;
    json?: boolean;
    pretty?: boolean;
  }>(argv, {
    title: { type: "string" },
    desc: { type: "string" },
    description: { type: "string" },
    priority: { type: "string" },
    assign: { type: "string" },
    project: { type: "string" },
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });

  const mode = resolveOutputMode(values);
  const title = values.title?.trim();
  if (!title) throw new UsageError("--title is required");

  const rawPriority = values.priority ?? "normal";
  if (!VALID_PRIORITIES.has(rawPriority)) {
    throw new UsageError(
      `Invalid priority "${rawPriority}". Valid: ${[...VALID_PRIORITIES].join(", ")}`
    );
  }
  const priority = rawPriority as TicketPriority;

  const env = resolvePaperclipEnv();
  const projectId = values.project ?? env.projectId;
  const description = values.desc ?? values.description;

  const body: Record<string, unknown> = {
    title,
    status: "todo",
    priority: TICKET_PRIORITY_TO_PAPERCLIP[priority],
  };
  if (description) body.description = description;
  if (values.assign) body.assigneeAgentId = values.assign;
  if (projectId) body.projectId = projectId;

  const data = (await paperclipFetch(env, `/api/companies/${env.companyId}/issues`, {
    method: "POST",
    body: JSON.stringify(body),
  })) as RawIssue;

  const ticket = toTicket(data);

  if (mode.json) {
    writeJson({ ok: true, ticket });
    return 0;
  }
  writeLine(`Created: ${ticket.id} — ${ticket.title}`);
  writeLine(`  status:   ${ticket.status}`);
  writeLine(`  priority: ${ticket.priority}`);
  if (ticket.assigneeAgentId) writeLine(`  assignee: ${ticket.assigneeAgentId}`);
  return 0;
}

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
  const issueId = positionals[0];
  if (!issueId) throw new UsageError("Usage: cp kanban assign <issueId> --agent <agentId>");
  if (!values.agent) throw new UsageError("--agent <agentId> is required");

  const env = resolvePaperclipEnv();
  const resolvedId = await resolveIssueId(env, issueId);

  const data = (await paperclipFetch(env, `/api/issues/${resolvedId}`, {
    method: "PATCH",
    body: JSON.stringify({ assigneeAgentId: values.agent }),
  })) as RawIssue;

  const ticket = toTicket(data);

  if (mode.json) {
    writeJson({ ok: true, ticket });
    return 0;
  }
  writeLine(`Assigned ${ticket.id} to ${ticket.assigneeAgentId ?? values.agent}`);
  return 0;
}

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
  const issueId = positionals[0];
  if (!issueId) throw new UsageError("Usage: cp kanban move <issueId> --status <ticketStatus>");
  if (!values.status) throw new UsageError("--status is required");
  if (!VALID_STATUSES.has(values.status)) {
    throw new UsageError(
      `Invalid status "${values.status}". Valid: ${[...VALID_STATUSES].join(", ")}`
    );
  }

  const ticketStatus = values.status as TicketStatus;
  const paperclipStatus = TICKET_STATUS_TO_PAPERCLIP[ticketStatus];

  const env = resolvePaperclipEnv();
  const resolvedId = await resolveIssueId(env, issueId);

  const data = (await paperclipFetch(env, `/api/issues/${resolvedId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: paperclipStatus }),
  })) as RawIssue;

  const ticket = toTicket(data);

  if (mode.json) {
    writeJson({ ok: true, ticket });
    return 0;
  }
  writeLine(`Moved ${ticket.id} → ${ticket.status}`);
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

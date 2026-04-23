import type { JsonObject, JsonValue, MetadataCarrier } from "./common.js";

export const TOOL_CALL_STATUSES = {
  Pending: "pending",
  Running: "running",
  Succeeded: "succeeded",
  Failed: "failed",
  Cancelled: "cancelled"
} as const;

export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[keyof typeof TOOL_CALL_STATUSES];

export interface ToolDescriptor extends MetadataCarrier {
  readonly name: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly inputSchema?: JsonObject;
  readonly outputSchema?: JsonObject;
  readonly destructive?: boolean;
  readonly requiresApproval?: boolean;
}

export interface ToolCall extends MetadataCarrier {
  readonly id: string;
  readonly sessionId: string;
  readonly toolName: string;
  readonly status: ToolCallStatus;
  readonly input: JsonValue;
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface ToolResult extends MetadataCarrier {
  readonly callId: string;
  readonly status: Extract<ToolCallStatus, "succeeded" | "failed" | "cancelled">;
  readonly output?: JsonValue;
  readonly error?: ToolError;
  readonly completedAt: string;
}

export interface ToolError {
  readonly code: string;
  readonly message: string;
  readonly details?: JsonObject;
}

// ─── Phase 1 Wave 0: tool categorization ──────────────────────────────────────
// Adapted from cc-lens (Arindam200/cc-lens, MIT) — see packages/core/src/lib/pricing.ts
// header for attribution details. Port is verbatim at the level of tool-name→
// category mapping; color/display helpers intentionally omitted (UI concern).

export const TOOL_CATEGORIES = {
  FileIo: "file-io",
  Shell: "shell",
  Agent: "agent",
  Web: "web",
  Planning: "planning",
  Todo: "todo",
  Skill: "skill",
  Mcp: "mcp",
  Other: "other"
} as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[keyof typeof TOOL_CATEGORIES];

export interface ToolCategorization {
  readonly name: string;
  readonly category: ToolCategory;
}

const TOOL_CATEGORY_MAP: Readonly<Record<string, ToolCategory>> = {
  // file-io
  Read: "file-io",
  Write: "file-io",
  Edit: "file-io",
  MultiEdit: "file-io",
  Glob: "file-io",
  Grep: "file-io",
  NotebookEdit: "file-io",
  NotebookRead: "file-io",
  LS: "file-io",
  // shell
  Bash: "shell",
  BashOutput: "shell",
  KillBash: "shell",
  KillShell: "shell",
  // agent
  Task: "agent",
  TaskCreate: "agent",
  TaskUpdate: "agent",
  TaskList: "agent",
  TaskOutput: "agent",
  TaskStop: "agent",
  TaskGet: "agent",
  // web
  WebSearch: "web",
  WebFetch: "web",
  // planning
  EnterPlanMode: "planning",
  ExitPlanMode: "planning",
  AskUserQuestion: "planning",
  // todo
  TodoWrite: "todo",
  // skill
  Skill: "skill",
  ToolSearch: "skill",
  ListMcpResourcesTool: "skill",
  ReadMcpResourceTool: "skill"
};

/**
 * Classifies a tool name into one of the canonical `ToolCategory` values.
 * `mcp__<server>__<tool>` always maps to `"mcp"`.
 */
export function categorizeTool(name: string): ToolCategory {
  if (isMcpTool(name)) return "mcp";
  return TOOL_CATEGORY_MAP[name] ?? "other";
}

/** Returns true if the tool name follows the `mcp__<server>__<tool>` pattern. */
export function isMcpTool(name: string): boolean {
  return name.startsWith("mcp__");
}

/**
 * Parses `mcp__<server>__<tool>` into its components. Returns `null` for names
 * that do not match the MCP pattern or whose parts are empty.
 */
export function parseMcpTool(name: string): { readonly server: string; readonly tool: string } | null {
  if (!isMcpTool(name)) return null;
  const parts = name.split("__");
  if (parts.length < 3) return null;
  const server = parts[1];
  if (!server) return null;
  const tool = parts.slice(2).join("__");
  if (!tool) return null;
  return { server, tool };
}

import {
  type ClaudeSessionFile,
  listSessionFiles,
  resolveDataRoot,
} from "@control-plane/adapter-claude-code";
import { errorResult, type ToolDefinition, type ToolResult } from "./types.js";

interface AgentStats {
  agentId: string;
  projectId: string;
  sessionCount: number;
  firstSeenAt: string | null;
  lastActiveAt: string | null;
  totalBytes: number;
}

function foldAgents(files: readonly ClaudeSessionFile[]): readonly AgentStats[] {
  const byProject = new Map<string, AgentStats>();
  for (const file of files) {
    let bucket = byProject.get(file.projectId);
    if (!bucket) {
      bucket = {
        agentId: `claude-code:${file.projectId}`,
        projectId: file.projectId,
        sessionCount: 0,
        firstSeenAt: null,
        lastActiveAt: null,
        totalBytes: 0,
      };
      byProject.set(file.projectId, bucket);
    }
    bucket.sessionCount += 1;
    bucket.totalBytes += file.sizeBytes;
    const mtime = file.modifiedAt;
    if (!bucket.firstSeenAt || mtime < bucket.firstSeenAt) {
      bucket.firstSeenAt = mtime;
    }
    if (!bucket.lastActiveAt || mtime > bucket.lastActiveAt) {
      bucket.lastActiveAt = mtime;
    }
  }
  return Array.from(byProject.values()).sort((a, b) => b.sessionCount - a.sessionCount);
}

export const agentsListTool: ToolDefinition = {
  name: "agents_list",
  description:
    "Read-only. Groups visible Claude Code session files by project and reports per-agent stats: session count, first-seen/last-active timestamps, and total bytes on disk.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (): Promise<ToolResult> => {
    try {
      const resolved = resolveDataRoot();
      if (!resolved) {
        return { ok: false, reason: "unconfigured" };
      }
      const files = await listSessionFiles({ directory: resolved.directory });
      const agents = foldAgents(files);
      return {
        ok: true,
        agentCount: agents.length,
        agents,
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

import { type ClaudeSessionFile, listSessionFiles } from "@control-plane/adapter-claude-code";
import { resolveOrExplain } from "../data-root.js";
import { parseFlags } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

interface AgentGroup {
  readonly agentId: string;
  readonly projectId: string;
  readonly sessionCount: number;
  readonly firstSeenAt: string;
  readonly lastActiveAt: string;
  readonly totalBytes: number;
}

export async function runAgentsList(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{ json?: boolean; pretty?: boolean }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
  });

  const mode = resolveOutputMode(values);
  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const files = await listSessionFiles({ directory: resolved.directory });
  const agents = groupByProject(files);

  if (mode.json) {
    writeJson({ ok: true, agents });
    return 0;
  }

  writeLine(bold(`Agents (${agents.length})`));
  writeLine("");
  if (agents.length === 0) {
    writeLine("No sessions under the configured data root.");
    return 0;
  }
  const rows = agents.map((agent) => [
    agent.agentId,
    agent.projectId,
    String(agent.sessionCount),
    agent.firstSeenAt,
    agent.lastActiveAt,
    String(agent.totalBytes),
  ]);
  writeLine(
    renderTable(["agent", "project", "sessions", "first_seen", "last_active", "total_bytes"], rows)
  );
  return 0;
}

function groupByProject(files: readonly ClaudeSessionFile[]): readonly AgentGroup[] {
  const groups = new Map<
    string,
    { sessionCount: number; firstSeenAt: string; lastActiveAt: string; totalBytes: number }
  >();

  for (const file of files) {
    const existing = groups.get(file.projectId);
    if (!existing) {
      groups.set(file.projectId, {
        sessionCount: 1,
        firstSeenAt: file.modifiedAt,
        lastActiveAt: file.modifiedAt,
        totalBytes: file.sizeBytes,
      });
      continue;
    }
    existing.sessionCount += 1;
    existing.totalBytes += file.sizeBytes;
    if (file.modifiedAt < existing.firstSeenAt) existing.firstSeenAt = file.modifiedAt;
    if (file.modifiedAt > existing.lastActiveAt) existing.lastActiveAt = file.modifiedAt;
  }

  const result: AgentGroup[] = [];
  for (const [projectId, stats] of groups) {
    result.push({
      agentId: `claude-code:${projectId}`,
      projectId,
      sessionCount: stats.sessionCount,
      firstSeenAt: stats.firstSeenAt,
      lastActiveAt: stats.lastActiveAt,
      totalBytes: stats.totalBytes,
    });
  }
  result.sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1));
  return result;
}

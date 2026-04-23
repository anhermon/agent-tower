import {
  type BranchRow,
  categorizeTool,
  type FeatureAdoption,
  type McpServerSummary,
  type McpServerTool,
  parseMcpTool,
  type SessionUsageSummary,
  type ToolAnalytics,
  type ToolSummary,
  type VersionRecord,
} from "@control-plane/core";

/**
 * Aggregated tools + features analytics computed from per-session summaries.
 * Pure: no I/O. Callers who want real per-tool error counts pass a pre-built
 * `toolErrorCounts` map (produced by `foldSessionSummary` via its
 * `toolErrorSink` option) — omitting it keeps backward-compat: `errorCount: 0`.
 */
export function foldToolAnalytics(
  sessions: readonly SessionUsageSummary[],
  toolErrorCounts: ReadonlyMap<string, number> = new Map()
): ToolAnalytics {
  const totalSessions = sessions.length;
  const toolRows = new Map<string, Mutable<ToolSummary>>();
  const mcpServers = new Map<string, { tools: Map<string, number>; sessions: Set<string> }>();
  const branches = new Map<string, number>();
  const versionMap = new Map<
    string,
    { sessionCount: number; firstSeen?: string; lastSeen?: string }
  >();

  const adoptionCounts: Mutable<Record<keyof FlagMap, number>> = {
    compaction: 0,
    thinking: 0,
    taskAgent: 0,
    mcp: 0,
    webSearch: 0,
    webFetch: 0,
  };

  let totalToolCalls = 0;

  for (const s of sessions) {
    for (const [tool, count] of Object.entries(s.toolCounts)) {
      totalToolCalls += count;
      const existing = toolRows.get(tool) ?? {
        name: tool,
        category: categorizeTool(tool),
        totalCalls: 0,
        sessionCount: 0,
        errorCount: 0,
      };
      existing.totalCalls += count;
      existing.sessionCount += 1;
      // errorCount comes from the pre-built attribution map; set once per
      // tool (value doesn't depend on session iteration order).
      existing.errorCount = toolErrorCounts.get(tool) ?? 0;
      toolRows.set(tool, existing);

      const mcp = parseMcpTool(tool);
      if (mcp) {
        const bucket = mcpServers.get(mcp.server) ?? {
          tools: new Map<string, number>(),
          sessions: new Set<string>(),
        };
        bucket.tools.set(mcp.tool, (bucket.tools.get(mcp.tool) ?? 0) + count);
        bucket.sessions.add(s.sessionId);
        mcpServers.set(mcp.server, bucket);
      }
    }

    if (s.gitBranch) {
      branches.set(s.gitBranch, (branches.get(s.gitBranch) ?? 0) + 1);
    }

    if (s.version && s.startTime) {
      const rec = versionMap.get(s.version) ?? { sessionCount: 0 };
      rec.sessionCount += 1;
      if (!rec.firstSeen || s.startTime < rec.firstSeen) rec.firstSeen = s.startTime;
      if (!rec.lastSeen || s.startTime > rec.lastSeen) rec.lastSeen = s.startTime;
      versionMap.set(s.version, rec);
    }

    if (s.flags.hasCompaction) adoptionCounts.compaction += 1;
    if (s.flags.hasThinking) adoptionCounts.thinking += 1;
    if (s.flags.usesTaskAgent) adoptionCounts.taskAgent += 1;
    if (s.flags.usesMcp) adoptionCounts.mcp += 1;
    if (s.flags.usesWebSearch) adoptionCounts.webSearch += 1;
    if (s.flags.usesWebFetch) adoptionCounts.webFetch += 1;
  }

  const tools = [...toolRows.values()].sort((a, b) => b.totalCalls - a.totalCalls);
  const mcpSummaries: McpServerSummary[] = [...mcpServers.entries()]
    .map(([server, v]) => {
      const tools: McpServerTool[] = [...v.tools.entries()]
        .map(([name, calls]) => ({ name, calls }))
        .sort((a, b) => b.calls - a.calls);
      const totalCalls = tools.reduce((acc, t) => acc + t.calls, 0);
      return {
        serverName: server,
        tools,
        totalCalls,
        sessionCount: v.sessions.size,
      };
    })
    .sort((a, b) => b.totalCalls - a.totalCalls);

  const versions: VersionRecord[] = [...versionMap.entries()]
    .map(([version, rec]) => ({
      version,
      sessionCount: rec.sessionCount,
      firstSeen: rec.firstSeen ?? "",
      lastSeen: rec.lastSeen ?? "",
    }))
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));

  const branchRows: BranchRow[] = [...branches.entries()]
    .map(([branch, turnCount]) => ({ branch, turnCount }))
    .sort((a, b) => b.turnCount - a.turnCount);

  const featureAdoption: Record<string, FeatureAdoption> = {};
  for (const [key, count] of Object.entries(adoptionCounts)) {
    featureAdoption[key] = {
      sessions: count,
      pct: totalSessions > 0 ? count / totalSessions : 0,
    };
  }

  let totalErrors = 0;
  for (const count of toolErrorCounts.values()) totalErrors += count;

  return {
    tools,
    mcpServers: mcpSummaries,
    featureAdoption,
    versions,
    branches: branchRows,
    totalToolCalls,
    totalErrors,
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type FlagMap = {
  readonly compaction: number;
  readonly thinking: number;
  readonly taskAgent: number;
  readonly mcp: number;
  readonly webSearch: number;
  readonly webFetch: number;
};

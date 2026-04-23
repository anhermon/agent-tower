import type { McpServerSummary } from "@control-plane/core";

interface Props {
  readonly servers: readonly McpServerSummary[];
}

export function McpServerPanel({ servers }: Props) {
  if (servers.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted">
        No MCP server usage detected
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {servers.map((srv) => {
        const sortedTools = [...srv.tools].sort((a, b) => b.calls - a.calls);
        const maxCalls = sortedTools[0]?.calls ?? 1;
        return (
          <div key={srv.serverName} className="rounded-sm border border-line/60 bg-panel/50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[13px] font-bold text-ok">{srv.serverName}</span>
              <span className="text-[11px] text-muted">
                {srv.tools.length} tools · {srv.totalCalls.toLocaleString()} calls ·{" "}
                {srv.sessionCount} sessions
              </span>
            </div>
            <ul className="space-y-1">
              {sortedTools.map((t) => {
                const width = Math.max(4, Math.round((t.calls / maxCalls) * 100));
                return (
                  <li key={t.name} className="flex items-center gap-2 text-[12px]">
                    <span className="w-32 truncate font-mono text-muted/90" title={t.name}>
                      {t.name}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft/60">
                      <div
                        className="h-full rounded-full bg-ok/60"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-muted/70">{t.calls}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

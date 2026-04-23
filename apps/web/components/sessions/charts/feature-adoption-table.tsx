import type { FeatureAdoption } from "@control-plane/core";

interface Props {
  readonly adoption: Readonly<Record<string, FeatureAdoption>>;
  readonly totalSessions: number;
}

const LABELS: Record<string, string> = {
  hasCompaction: "Compaction",
  hasThinking: "Extended Thinking",
  usesTaskAgent: "Task Agents",
  usesMcp: "MCP Servers",
  usesWebSearch: "Web Search",
  usesWebFetch: "Web Fetch",
  task_agents: "Task Agents",
  mcp: "MCP Servers",
  web_search: "Web Search",
  web_fetch: "Web Fetch",
  plan_mode: "Plan Mode",
  git_commits: "Git Commits",
  extended_thinking: "Extended Thinking",
};

function labelFor(key: string): string {
  return LABELS[key] ?? key;
}

export function FeatureAdoptionTable({ adoption, totalSessions }: Props) {
  const rows = Object.entries(adoption)
    .map(([key, data]) => ({ key, label: labelFor(key), ...data }))
    .sort((a, b) => b.sessions - a.sessions);

  if (rows.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted">
        No feature adoption data
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line/70">
            <th scope="col" className="eyebrow py-2 text-left">
              Feature
            </th>
            <th scope="col" className="eyebrow py-2 text-right">
              Sessions
            </th>
            <th scope="col" className="eyebrow py-2 text-right">
              % of Total
            </th>
            <th scope="col" className="eyebrow w-32 py-2 pl-4 text-left">
              Adoption
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = (r.pct * 100).toFixed(1);
            const width = Math.round(r.pct * 100);
            return (
              <tr key={r.key} className="border-b border-line/30 hover:bg-soft/30">
                <td className="py-2 text-ink/80">{r.label}</td>
                <td className="py-2 text-right font-bold text-ink">
                  {r.sessions.toLocaleString()}
                </td>
                <td className="py-2 text-right" style={{ color: "#d97706" }}>
                  {pct}%
                </td>
                <td className="py-2 pl-4">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-soft/60">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${width}%`, backgroundColor: "rgba(217,119,6,0.6)" }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted/70">
        {totalSessions.toLocaleString()} total sessions analyzed
      </p>
    </div>
  );
}

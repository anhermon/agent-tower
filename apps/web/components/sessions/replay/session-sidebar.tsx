import { type ReplayData, parseMcpTool } from "@control-plane/core";

import { formatCost, formatTokens } from "@/lib/format";

interface Props {
  readonly replay: ReplayData;
}

interface Bar {
  readonly label: string;
  readonly value: number;
  readonly barClass: string;
  readonly textClass: string;
}

/**
 * Right-rail sidebar: token mini-bars, top-8 tools, compaction list, and
 * lightweight metadata (slug, version, gitBranch). Pure server component —
 * no interactivity. Computes bars from the canonical ReplayData.
 */
export function SessionSidebar({ replay }: Props) {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const t of replay.turns) {
    if (!t.usage) continue;
    inputTokens += t.usage.inputTokens;
    outputTokens += t.usage.outputTokens;
    cacheRead += t.usage.cacheReadInputTokens;
    cacheWrite += t.usage.cacheCreationInputTokens;
  }
  const totalTokens = inputTokens + outputTokens + cacheRead + cacheWrite;
  const pct = (n: number): number => (totalTokens > 0 ? (n / totalTokens) * 100 : 0);

  const toolCounts = new Map<string, number>();
  for (const t of replay.turns) {
    for (const tc of t.toolCalls ?? []) {
      toolCounts.set(tc.name, (toolCounts.get(tc.name) ?? 0) + 1);
    }
  }
  const topTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxToolCount = topTools[0]?.[1] ?? 1;

  const assistantTurns = replay.turns.filter((t) => t.type === "assistant").length;

  const bars: readonly Bar[] = [
    { label: "Input", value: inputTokens, barClass: "bg-info/70", textClass: "text-info" },
    { label: "Output", value: outputTokens, barClass: "bg-warn/70", textClass: "text-warn" },
    { label: "Cache write", value: cacheWrite, barClass: "bg-accent/70", textClass: "text-accent" },
    { label: "Cache read", value: cacheRead, barClass: "bg-ok/70", textClass: "text-ok" },
  ];

  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="eyebrow mb-3">Token breakdown</h3>
        <div className="space-y-3">
          {bars.map((bar) => (
            <div key={bar.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{bar.label}</span>
                <span className={`font-mono text-xs font-semibold ${bar.textClass}`}>
                  {formatTokens(bar.value)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full ${bar.barClass} transition-all`}
                  style={{ width: `${Math.max(2, pct(bar.value))}%` }}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-line/40 pt-3">
            <span className="text-xs font-semibold text-muted">Total</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-ink">
                {formatTokens(totalTokens)}
              </span>
              <span className="font-mono text-xs font-bold text-warn">
                {formatCost(replay.totalCostUsd)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {topTools.length > 0 ? (
        <section>
          <h3 className="eyebrow mb-3">Top tools</h3>
          <div className="space-y-2">
            {topTools.map(([name, count]) => {
              const mcp = parseMcpTool(name);
              const shortName = mcp ? `${mcp.server} · ${mcp.tool}` : name;
              const width = Math.round((count / maxToolCount) * 100);
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-28 truncate text-xs text-muted" title={name}>
                    {shortName}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-warn/60"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-xs text-muted">{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {replay.compactions.length > 0 ? (
        <section>
          <h3 className="eyebrow mb-3">Compactions</h3>
          <ul className="space-y-2">
            {replay.compactions.map((c) => (
              <li
                key={c.uuid}
                className="flex items-start gap-2 rounded-md border border-warn/20 bg-warn/5 px-2.5 py-2"
              >
                <span aria-hidden className="mt-0.5 text-warn">
                  ⚡
                </span>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-warn/90">Turn {c.turnIndex}</span>
                    <span className="rounded-xs border border-warn/30 px-1 py-0 text-[10px] text-warn/80">
                      {c.trigger}
                    </span>
                  </div>
                  <span className="text-xs text-muted/70">
                    {formatTokens(c.preTokens)} tokens before
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="eyebrow mb-3">Session info</h3>
        <dl className="space-y-2">
          {replay.slug ? <Row label="Slug" value={replay.slug} mono /> : null}
          {replay.version ? <Row label="Version" value={`v${replay.version}`} mono /> : null}
          {replay.gitBranch ? <Row label="Branch" value={replay.gitBranch} mono /> : null}
          <Row label="Turns" value={String(assistantTurns)} />
          <Row label="Compactions" value={String(replay.compactions.length)} />
          <Row label="Cost" value={formatCost(replay.totalCostUsd)} />
        </dl>
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-20 shrink-0 text-xs text-muted/70">{label}</dt>
      <dd
        className={`flex-1 truncate text-xs text-ink/80 ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

import type { ReplayCompactionEvent, ReplayData, SessionDerivedFlags } from "@control-plane/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { AgentTree } from "@/components/sessions/replay/agent-tree";
import { ExplorerPanel } from "@/components/sessions/replay/explorer-panel";
import { FindInSession } from "@/components/sessions/replay/find-in-session";
import { PrLinkCard } from "@/components/sessions/replay/pr-link-card";
import { SessionSidebar } from "@/components/sessions/replay/session-sidebar";
import { TokenAccumulationChartLazy } from "@/components/sessions/replay/token-accumulation-chart-lazy";
import { TurnCard } from "@/components/sessions/replay/turn-card";
import { SessionBadges } from "@/components/sessions/session-badges";
import { formatCost, formatDuration, formatTokens } from "@/lib/format";

type ToolResultLookup = ReadonlyMap<
  string,
  { readonly content: string; readonly isError: boolean; readonly toolName?: string }
>;

type Props = {
  readonly replay: ReplayData;
  readonly flags?: SessionDerivedFlags;
  readonly durationMs?: number;
  readonly deepLinkTurn?: string;
};

export function SessionDetail({ replay, flags, durationMs, deepLinkTurn }: Props): ReactNode {
  const assistantCount = replay.turns.filter((t) => t.type === "assistant").length;
  const toolResults = collectToolResults(replay);
  const compactionByTurn = new Map<number, ReplayCompactionEvent>();
  for (const c of replay.compactions) compactionByTurn.set(c.turnIndex, c);

  let inputTokens = 0,
    outputTokens = 0,
    cacheRead = 0,
    cacheWrite = 0;
  for (const t of replay.turns) {
    if (!t.usage) continue;
    inputTokens += t.usage.inputTokens;
    outputTokens += t.usage.outputTokens;
    cacheRead += t.usage.cacheReadInputTokens;
    cacheWrite += t.usage.cacheCreationInputTokens;
  }
  const totalTokens = inputTokens + outputTokens + cacheRead + cacheWrite;

  let assistantIndex = 0;

  return (
    <section className="space-y-6">
      <FindInSession />
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/sessions" className="text-cyan hover:underline">
          ← Back to sessions
        </Link>
        <div className="flex items-center gap-3">
          <a
            href={`/sessions/${encodeURIComponent(replay.sessionId)}/export`}
            className="rounded-xs border border-line/60 px-2 py-1 font-mono text-xs text-muted hover:border-cyan hover:text-cyan"
          >
            Export HTML
          </a>
          <span className="font-mono text-xs text-muted" title={replay.sessionId}>
            {replay.sessionId.slice(0, 8)}
          </span>
        </div>
      </div>

      <header className="glass-panel accent-gradient-subtle relative overflow-hidden rounded-lg p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Session</p>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-ink md:text-[28px]">
              {replay.slug ?? <span className="text-muted">Untitled session</span>}
            </h1>
            <p className="mt-2 break-all font-mono text-xs text-muted">{replay.sessionId}</p>
            {flags ? (
              <div className="mt-3">
                <SessionBadges flags={flags} />
              </div>
            ) : null}
          </div>
          <div className="text-right">
            <p className="eyebrow">Meta</p>
            {replay.gitBranch ? (
              <p className="mt-2 font-mono text-xs text-ink">{replay.gitBranch}</p>
            ) : null}
            {replay.version ? (
              <p className="mt-1 font-mono text-[11px] text-muted">v{replay.version}</p>
            ) : null}
          </div>
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Turns" value={String(assistantCount)} accent="text-ink" />
          <Stat label="Total tokens" value={formatTokens(totalTokens)} accent="text-info" />
          <Stat label="Cost" value={formatCost(replay.totalCostUsd)} accent="text-warn" />
          <Stat
            label="Duration"
            value={typeof durationMs === "number" ? formatDuration(durationMs) : "—"}
          />
          <Stat
            label="Compactions"
            value={String(replay.compactions.length)}
            accent={replay.compactions.length > 0 ? "text-warn" : "text-muted"}
          />
        </dl>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3" data-find-scope>
          {replay.turns.length === 0 ? (
            <div className="rounded-md border border-dashed border-line/70 bg-white/[0.02] p-6 text-center text-sm text-muted">
              No turns in this transcript.
            </div>
          ) : (
            replay.turns.map((turn, i) => {
              if (turn.type === "assistant") assistantIndex += 1;
              const compactionBefore = compactionByTurn.get(i);
              const scrollTarget = deepLinkTurn === turn.uuid;
              return (
                <div key={turn.uuid} data-turn-target={scrollTarget ? "1" : undefined}>
                  <TurnCard
                    turn={turn}
                    turnNumber={i + 1}
                    assistantNumber={turn.type === "assistant" ? assistantIndex : undefined}
                    compactionBefore={compactionBefore}
                    toolResults={toolResults}
                  />
                </div>
              );
            })
          )}
          <TokenAccumulationChartLazy turns={replay.turns} compactions={replay.compactions} />
        </div>

        <aside className="space-y-4">
          <SessionSidebar replay={replay} />
          <AgentTree replay={replay} />
          <ExplorerPanel replay={replay} />
          <PrLinkCard replay={replay} />
        </aside>
      </div>

      {deepLinkTurn ? (
        // Minimal inline script to smoothly scroll the target turn into view on
        // first paint. Falls back silently when the id is unknown.
        <script
          // eslint-disable-next-line react/no-danger
          // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped id, used to smooth-scroll deep-link target
          dangerouslySetInnerHTML={{
            __html: `window.requestAnimationFrame(function(){var el=document.getElementById('turn-${escapeJs(
              deepLinkTurn
            )}');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});}});`,
          }}
        />
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  accent = "text-ink",
}: {
  readonly label: string;
  readonly value: string;
  readonly accent?: string;
}) {
  return (
    <div className="glass-panel-soft rounded-xs p-3">
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${accent}`}>{value}</dd>
    </div>
  );
}

function collectToolResults(replay: ReplayData): ToolResultLookup {
  const callsById = new Map<string, string>();
  for (const t of replay.turns) {
    for (const tc of t.toolCalls ?? []) callsById.set(tc.id, tc.name);
  }
  const map = new Map<
    string,
    { readonly content: string; readonly isError: boolean; readonly toolName?: string }
  >();
  for (const t of replay.turns) {
    if (!t.toolResults) continue;
    for (const r of t.toolResults) {
      map.set(r.toolUseId, {
        content: r.content,
        isError: r.isError,
        toolName: callsById.get(r.toolUseId),
      });
    }
  }
  return map;
}

function escapeJs(input: string): string {
  return input.replace(/[\\'"<>]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

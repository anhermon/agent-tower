"use client";

import type { ReplayCompactionEvent, ReplayTurn } from "@control-plane/core";
import dynamic from "next/dynamic";
import { memo, useState } from "react";
import { formatCost, formatDuration, formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CompactionCard } from "./compaction-card";

// Dynamically load the markdown renderer so react-markdown + remark-gfm land
// in a lazy chunk rather than the initial session-detail bundle.
const AssistantMarkdown = dynamic(
  () => import("./assistant-markdown").then((m) => m.AssistantMarkdown),
  {
    ssr: false,
    loading: () => (
      <pre aria-busy="true" className="whitespace-pre-wrap text-sm leading-6 text-ink" />
    ),
  }
);

import { RawToggle } from "./raw-toggle";
import { TodoWritePanel } from "./todo-write-panel";
import { ToolCallBadge } from "./tool-call-badge";
import { UserToolResult } from "./user-tool-result";

type ToolResultLookup = ReadonlyMap<
  string,
  { readonly content: string; readonly isError: boolean; readonly toolName?: string }
>;

const ASSISTANT_COLLAPSE_THRESHOLD = 900;

type Props = {
  readonly turn: ReplayTurn;
  readonly turnNumber: number;
  readonly assistantNumber?: number;
  readonly compactionBefore?: ReplayCompactionEvent;
  readonly toolResults: ToolResultLookup;
};

function TurnCardInner(props: Props) {
  return props.turn.type === "user" ? <UserTurn {...props} /> : <AssistantTurn {...props} />;
}

// Memoize so ancestor re-renders don't cascade through hundreds of turns. Keyed
// by `turn.uuid` in the parent; shallow-equal on `turn`/`toolResults` reference
// is sufficient because `replay` is produced once on the server per request.
export const TurnCard = memo(TurnCardInner);

function UserTurn({ turn, compactionBefore, toolResults }: Props) {
  return (
    <div id={`turn-${turn.uuid}`} data-find-scope>
      {compactionBefore ? <CompactionCard event={compactionBefore} /> : null}
      <div className="mb-5 flex flex-col items-end gap-1.5">
        <span className="pr-1 text-[10px] text-muted/50">
          {new Date(turn.timestamp).toLocaleTimeString()}
        </span>
        {turn.text ? (
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-accent/30 bg-accent/10 px-4 py-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/90">
              {turn.text}
            </p>
          </div>
        ) : null}
        {turn.toolResults && turn.toolResults.length > 0 ? (
          <div className="flex w-full max-w-[90%] flex-col gap-2">
            {turn.toolResults.map((r) => {
              const meta = toolResults.get(r.toolUseId);
              return (
                <UserToolResult
                  key={r.toolUseId}
                  content={r.content}
                  isError={r.isError}
                  toolName={meta?.toolName}
                />
              );
            })}
          </div>
        ) : null}
        <RawToggle turn={turn} />
      </div>
    </div>
  );
}

function shortenModel(model?: string): string {
  if (!model) return "Claude";
  if (model.includes("opus-4-7")) return "Opus 4.7";
  if (model.includes("opus-4-6")) return "Opus 4.6";
  if (model.includes("opus-4-5")) return "Opus 4.5";
  if (model.includes("opus-4")) return "Opus 4";
  if (model.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (model.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model;
}

function AssistantTurn({ turn, assistantNumber, compactionBefore, toolResults }: Props) {
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const text = turn.text ?? "";
  const needsExpand = text.length > ASSISTANT_COLLAPSE_THRESHOLD;

  return (
    <div id={`turn-${turn.uuid}`} data-find-scope className="mb-6 flex flex-col gap-1.5">
      {compactionBefore ? <CompactionCard event={compactionBefore} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-accent/40 bg-accent/20">
            <span className="text-[10px] font-bold text-accent">C</span>
          </div>
          <span className="text-xs font-semibold text-accent/80">Claude</span>
        </div>
        <span className="rounded-xs border border-line/60 px-1.5 py-0.5 font-mono text-[10px] text-ink">
          {shortenModel(turn.model)}
        </span>
        {assistantNumber ? (
          <span className="font-mono text-[10px] text-muted/50">#{assistantNumber}</span>
        ) : null}
        {turn.turnDurationMs ? (
          <span className="font-mono text-[10px] text-muted/60">
            ⌛ {formatDuration(turn.turnDurationMs)}
          </span>
        ) : null}
      </div>

      {turn.hasThinking ? (
        <div className="ml-8">
          <button
            type="button"
            onClick={() => setThinkingOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xs px-2 py-1 text-xs font-medium text-cyan hover:bg-cyan/10"
          >
            <span aria-hidden>◉</span>
            Extended thinking
            <span className={cn("text-[10px] transition-transform", thinkingOpen && "rotate-180")}>
              ▾
            </span>
          </button>
          {thinkingOpen && turn.thinkingText ? (
            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-cyan/30 bg-cyan/5 px-4 py-3 text-xs leading-relaxed text-cyan/80">
              {turn.thinkingText.slice(0, 3000)}
              {turn.thinkingText.length > 3000 ? (
                <span className="text-cyan/40">
                  {" "}
                  …[{(turn.thinkingText.length - 3000).toLocaleString()} more chars]
                </span>
              ) : null}
            </pre>
          ) : null}
        </div>
      ) : null}

      {turn.toolCalls && turn.toolCalls.length > 0 ? (
        <div className="ml-8 space-y-1">
          {turn.toolCalls.map((tc) => {
            const result = toolResults.get(tc.id);
            const resultForBadge = result
              ? { content: result.content, isError: result.isError }
              : undefined;
            return (
              <div key={tc.id}>
                <ToolCallBadge tool={tc} result={resultForBadge} />
                {tc.name === "TodoWrite" ? <TodoWritePanel input={tc.input} /> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {text ? (
        <div className="ml-8">
          <div className="rounded-2xl rounded-tl-sm border border-line/60 bg-panel px-4 py-3">
            <div
              className={cn(
                "relative",
                needsExpand && !expanded && "max-h-[28rem] overflow-hidden"
              )}
            >
              <AssistantMarkdown content={text} />
              {needsExpand && !expanded ? (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-panel to-transparent"
                  aria-hidden
                />
              ) : null}
            </div>
            {needsExpand ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-cyan"
              >
                {expanded ? "▴ Show less" : "▾ Show full response"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {turn.usage ? (
        <div className="ml-8 mt-0.5">
          <TokenBreakdown turn={turn} />
        </div>
      ) : null}

      <div className="ml-8">
        <RawToggle turn={turn} />
      </div>
    </div>
  );
}

function TokenBreakdown({ turn }: { turn: ReplayTurn }) {
  const u = turn.usage;
  if (!u) return null;
  const items: Array<{ label: string; value: number; color: string } | null> = [
    u.inputTokens ? { label: "In", value: u.inputTokens, color: "#60a5fa" } : null,
    u.outputTokens ? { label: "Out", value: u.outputTokens, color: "#d97706" } : null,
    u.cacheCreationInputTokens
      ? { label: "cW", value: u.cacheCreationInputTokens, color: "#a78bfa" }
      : null,
    u.cacheReadInputTokens
      ? { label: "cR", value: u.cacheReadInputTokens, color: "#34d399" }
      : null,
  ];
  const kept = items.filter(
    (x): x is { label: string; value: number; color: string } => x !== null
  );
  if (kept.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-muted/60" aria-hidden>
        ⨀
      </span>
      {kept.map(({ label, value, color }) => (
        <span
          key={label}
          className="rounded-xs border border-line/50 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px]"
          style={{ color }}
        >
          {label}:{formatTokens(value)}
        </span>
      ))}
      {typeof turn.estimatedCostUsd === "number" && turn.estimatedCostUsd > 0 ? (
        <span className="rounded-xs px-1 py-0.5 font-mono text-[10px] text-[#d97706]">
          {formatCost(turn.estimatedCostUsd)}
        </span>
      ) : null}
    </div>
  );
}

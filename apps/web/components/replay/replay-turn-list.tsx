import type { ReplayData, ReplayToolCall, ReplayToolResult, ReplayTurn } from "@control-plane/core";

interface ReplayTurnListProps {
  readonly replay: ReplayData;
}

export function ReplayTurnList({ replay }: ReplayTurnListProps) {
  if (replay.turns.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">No turns recorded in this session.</p>
    );
  }

  return (
    <ol className="space-y-3">
      {replay.turns.map((turn, index) => (
        <TurnItem key={turn.uuid || index} turn={turn} index={index} />
      ))}
    </ol>
  );
}

interface TurnItemProps {
  readonly turn: ReplayTurn;
  readonly index: number;
}

function TurnItem({ turn, index }: TurnItemProps) {
  const isUser = turn.type === "user";
  const toolCallCount = turn.toolCalls?.length ?? 0;
  const toolResultCount = turn.toolResults?.length ?? 0;
  const textPreview = turn.text ? turn.text.slice(0, 200) : "";
  const textTruncated = turn.text && turn.text.length > 200;

  return (
    <li
      className={`rounded-md border px-4 py-3 ${
        isUser ? "border-line/50 bg-white/[0.02]" : "border-accent/20 bg-accent/[0.04]"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${
            isUser ? "text-muted" : "text-accent"
          }`}
        >
          {turn.type}
        </span>
        <span className="font-mono text-xs text-muted/60">#{index + 1}</span>
        {turn.model ? <span className="font-mono text-xs text-muted/60">{turn.model}</span> : null}
        {turn.estimatedCostUsd !== undefined && turn.estimatedCostUsd > 0 ? (
          <span className="font-mono text-xs text-muted/60">
            ${turn.estimatedCostUsd.toFixed(4)}
          </span>
        ) : null}
        {turn.turnDurationMs !== undefined ? (
          <span className="font-mono text-xs text-muted/60">
            {(turn.turnDurationMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>

      {textPreview ? (
        <p className="mt-2 text-sm leading-6 text-ink">
          {textPreview}
          {textTruncated ? <span className="text-muted"> …</span> : null}
        </p>
      ) : null}

      {toolCallCount > 0 && turn.toolCalls ? (
        <div className="mt-2 space-y-1">
          {turn.toolCalls.map((tc) => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      ) : null}

      {toolResultCount > 0 && turn.toolResults ? (
        <div className="mt-2 space-y-1">
          {turn.toolResults.map((tr) => (
            <ToolResultBlock key={tr.toolUseId} toolResult={tr} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

interface ToolCallBlockProps {
  readonly toolCall: ReplayToolCall;
}

function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  const inputPreview = toolCall.input ? JSON.stringify(toolCall.input).slice(0, 150) : "";
  const inputTruncated = toolCall.input && JSON.stringify(toolCall.input).length > 150;

  return (
    <details className="rounded border border-line/40 bg-soft/30">
      <summary className="cursor-pointer select-none px-3 py-1.5 font-mono text-xs text-ink hover:bg-soft/60">
        <span className="text-muted">tool_use</span>{" "}
        <span className="font-semibold">{toolCall.name}</span>
      </summary>
      <div className="border-t border-line/40 px-3 py-2">
        <p className="font-mono text-xs leading-5 text-muted/80 break-all">
          {inputPreview}
          {inputTruncated ? " …" : ""}
        </p>
      </div>
    </details>
  );
}

interface ToolResultBlockProps {
  readonly toolResult: ReplayToolResult;
}

function ToolResultBlock({ toolResult }: ToolResultBlockProps) {
  const preview = toolResult.content.slice(0, 150);
  const truncated = toolResult.content.length > 150;

  return (
    <details className="rounded border border-line/40 bg-soft/30">
      <summary className="cursor-pointer select-none px-3 py-1.5 font-mono text-xs text-ink hover:bg-soft/60">
        <span className="text-muted">tool_result</span>{" "}
        {toolResult.isError ? (
          <span className="text-danger">error</span>
        ) : (
          <span className="text-ok">ok</span>
        )}
      </summary>
      {preview ? (
        <div className="border-t border-line/40 px-3 py-2">
          <p className="font-mono text-xs leading-5 text-muted/80 break-all">
            {preview}
            {truncated ? " …" : ""}
          </p>
        </div>
      ) : null}
    </details>
  );
}

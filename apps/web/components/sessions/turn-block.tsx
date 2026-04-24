import type { JsonValue, SessionActorRole, SessionTurn } from "@control-plane/core";

import { Collapsible } from "@/components/sessions/collapsible";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<SessionActorRole, string> = {
  user: "text-info",
  agent: "text-ok",
  tool: "text-warn",
  system: "text-muted",
};

const PREVIEW_CHARS = 800;

interface TurnBlockProps {
  turn: SessionTurn;
}

export function TurnBlock({ turn }: TurnBlockProps) {
  return (
    <article className="glass-panel rounded-md p-5">
      <header className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="font-mono text-muted">#{turn.sequence}</span>
        <span className={cn("pill capitalize", ROLE_TONE[turn.actor.role])}>{turn.actor.role}</span>
        <span className="font-mono text-muted/80">{turn.createdAt}</span>
      </header>
      <div className="mt-3">
        <TurnContent turn={turn} />
      </div>
    </article>
  );
}

function TurnContent({ turn }: { turn: SessionTurn }) {
  const { content } = turn;

  if (content.kind === "text") {
    return (
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{content.text}</p>
    );
  }

  if (content.kind === "json") {
    return <JsonViewer value={content.value} />;
  }

  if (content.kind === "tool_call") {
    const { call } = content;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="eyebrow">Tool call</span>
          <span className="rounded-xs border border-line/80 bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-ink">
            {call.toolName}
          </span>
          <span className="font-mono text-xs text-muted/80">{call.id}</span>
        </div>
        <JsonViewer value={call.input} label="input" />
      </div>
    );
  }

  const { result } = content;
  const succeeded = result.status === "succeeded";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="eyebrow">Tool result</span>
        <span className={cn("pill", succeeded ? "text-ok" : "text-danger")}>{result.status}</span>
        <span className="font-mono text-xs text-muted/80">{result.callId}</span>
      </div>
      <JsonViewer value={result.output ?? null} label="output" />
    </div>
  );
}

function JsonViewer({ value, label }: { value: JsonValue; label?: string }) {
  const pretty = prettyJson(value);
  const preview = pretty.length > PREVIEW_CHARS ? `${pretty.slice(0, PREVIEW_CHARS)}\n…` : pretty;

  return (
    <div>
      {label ? <p className="eyebrow mb-1">{label}</p> : null}
      <Collapsible preview={preview} full={pretty} />
    </div>
  );
}

function prettyJson(value: JsonValue): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- fallback for values that failed JSON.stringify; intentional stringify
    return String(value);
  }
}

import type { ReplayCompactionEvent } from "@control-plane/core";
import { formatTokens } from "@/lib/format";

type Props = {
  readonly event: ReplayCompactionEvent;
};

export function CompactionCard({ event }: Props) {
  return (
    <div className="my-4 rounded-md border border-warn/40 bg-warn/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-warn">
        <span aria-hidden>⚡</span>
        <span className="text-sm font-bold uppercase tracking-wide">Context compaction</span>
        <span className="ml-auto font-mono text-xs text-warn/70">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-warn/80">
        <span>
          trigger: <span className="font-semibold text-warn">{event.trigger}</span>
        </span>
        <span>
          context before:{" "}
          <span className="font-semibold text-warn">{formatTokens(event.preTokens)} tokens</span>
        </span>
        <span>
          at turn: <span className="font-semibold text-warn">{event.turnIndex}</span>
        </span>
      </div>
      {event.summary ? (
        <p className="mt-1.5 line-clamp-2 text-sm italic text-warn/70">
          &ldquo;{event.summary}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

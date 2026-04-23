import type { ClaudeSessionFile } from "@control-plane/adapter-claude-code";
import Link from "next/link";
import { formatBytes, formatRelative, truncateMiddle } from "@/lib/format";

type AgentSessionListProps = {
  readonly sessions: readonly ClaudeSessionFile[];
};

export function AgentSessionList({ sessions }: AgentSessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line/70 bg-white/[0.02] p-6 text-center text-sm text-muted">
        No sessions recorded for this agent yet.
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden rounded-md">
      <ul role="list" className="divide-y divide-line/60">
        {sessions.map((session) => (
          <li key={session.filePath}>
            <Link
              href={`/sessions/${encodeURIComponent(session.sessionId)}`}
              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-ink group-hover:text-cyan">
                  {truncateMiddle(session.sessionId, 40)}
                </p>
                <p className="mt-1 truncate font-mono text-xs text-muted" title={session.filePath}>
                  {session.filePath}
                </p>
              </div>
              <div className="hidden shrink-0 text-right text-xs text-muted md:block">
                <div>{formatBytes(session.sizeBytes)}</div>
                <div className="mt-1 text-muted/80">{formatRelative(session.modifiedAt)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

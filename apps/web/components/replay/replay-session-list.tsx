import Link from "next/link";

import type { SessionListing } from "@/lib/replay-source";

interface ReplaySessionListProps {
  readonly sessions: readonly SessionListing[];
}

export function ReplaySessionList({ sessions }: ReplaySessionListProps) {
  return (
    <div className="overflow-hidden rounded-md border border-line/70">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line/70 bg-soft/50">
            <th className="px-4 py-2 text-left font-medium text-muted">Session</th>
            <th className="hidden px-4 py-2 text-left font-medium text-muted md:table-cell">
              Model
            </th>
            <th className="hidden px-4 py-2 text-right font-medium text-muted md:table-cell">
              Turns
            </th>
            <th className="hidden px-4 py-2 text-left font-medium text-muted lg:table-cell">
              Modified
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.sessionId}
              className="border-b border-line/40 last:border-0 hover:bg-soft/40"
            >
              <td className="max-w-xs px-4 py-3">
                <Link
                  href={`/replay/${encodeURIComponent(session.sessionId)}`}
                  className="block truncate font-mono text-xs text-accent hover:underline"
                  title={session.sessionId}
                >
                  {session.title ?? session.sessionId.slice(0, 32)}
                </Link>
                {session.firstUserText ? (
                  <p className="mt-0.5 truncate text-xs text-muted" title={session.firstUserText}>
                    {session.firstUserText.slice(0, 80)}
                  </p>
                ) : null}
              </td>
              <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">
                {session.model ?? "—"}
              </td>
              <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted md:table-cell">
                {session.turnCountLowerBound > 0 ? `≥${session.turnCountLowerBound}` : "—"}
              </td>
              <td className="hidden px-4 py-3 text-xs text-muted lg:table-cell">
                {session.modifiedAt
                  ? new Date(session.modifiedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

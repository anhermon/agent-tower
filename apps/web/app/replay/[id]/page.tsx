import Link from "next/link";
import { notFound } from "next/navigation";

import { ReplayTurnList } from "@/components/replay/replay-turn-list";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { CLAUDE_DATA_ROOT_ENV, getReplayData } from "@/lib/replay-source";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReplayDetailPage({ params }: PageProps) {
  const { id } = await params;
  const sessionId = decodeURIComponent(id);

  const result = await getReplayData(sessionId);

  if (!result.ok) {
    return (
      <section className="space-y-5">
        <Link href="/replay" className="text-sm text-accent hover:underline">
          ← Back to replay
        </Link>
        {result.reason === "unconfigured" ? (
          <EmptyState
            title="No session records"
            description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory.`}
          />
        ) : (
          <ErrorState
            title="Could not load session"
            description={result.message ?? "An unknown error occurred reading the transcript."}
          />
        )}
      </section>
    );
  }

  if (!result.value) {
    notFound();
  }

  const replay = result.value;
  const turnCount = replay.turns.length;

  return (
    <section className="space-y-5">
      <Link href="/replay" className="text-sm text-accent hover:underline">
        ← Back to replay
      </Link>

      <div className="rounded-md border border-line/70 bg-soft/20 px-5 py-4">
        <h1 className="truncate font-mono text-sm font-semibold text-ink" title={replay.sessionId}>
          {replay.sessionId}
        </h1>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          {replay.slug ? (
            <div className="flex gap-1">
              <dt className="font-medium">project</dt>
              <dd className="font-mono">{replay.slug}</dd>
            </div>
          ) : null}
          {replay.gitBranch ? (
            <div className="flex gap-1">
              <dt className="font-medium">branch</dt>
              <dd className="font-mono">{replay.gitBranch}</dd>
            </div>
          ) : null}
          {replay.version ? (
            <div className="flex gap-1">
              <dt className="font-medium">version</dt>
              <dd className="font-mono">{replay.version}</dd>
            </div>
          ) : null}
          <div className="flex gap-1">
            <dt className="font-medium">turns</dt>
            <dd className="font-mono">{turnCount}</dd>
          </div>
          {replay.totalCostUsd > 0 ? (
            <div className="flex gap-1">
              <dt className="font-medium">cost</dt>
              <dd className="font-mono">${replay.totalCostUsd.toFixed(4)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <ReplayTurnList replay={replay} />
    </section>
  );
}

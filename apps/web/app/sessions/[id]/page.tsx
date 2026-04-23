import Link from "next/link";
import { SessionDetail } from "@/components/sessions/session-detail";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { loadReplay } from "@/lib/sessions-analytics";
import { CLAUDE_DATA_ROOT_ENV, loadSessionUsageOrEmpty } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SessionDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const qs = (await searchParams) ?? {};
  const rawTurn = qs.turn;
  const deepLinkTurn =
    typeof rawTurn === "string" ? rawTurn : Array.isArray(rawTurn) ? rawTurn[0] : undefined;

  const [replayResult, usageResult] = await Promise.all([
    loadReplay(id),
    loadSessionUsageOrEmpty(id),
  ]);

  if (!replayResult.ok) {
    return (
      <section className="space-y-5">
        <Link href="/sessions" className="text-sm text-accent hover:underline">
          ← Back to sessions
        </Link>
        {replayResult.reason === "unconfigured" ? (
          <EmptyState
            title="No sessions records"
            description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory.`}
          />
        ) : (
          <ErrorState
            title="Could not load session"
            description={
              replayResult.message ?? "An unknown error occurred reading the transcript."
            }
          />
        )}
      </section>
    );
  }

  if (!replayResult.value) {
    return (
      <section className="space-y-5">
        <Link href="/sessions" className="text-sm text-accent hover:underline">
          ← Back to sessions
        </Link>
        <EmptyState
          title="Session not found"
          description={`No transcript with id ${id} was found under the configured data root.`}
        />
      </section>
    );
  }

  const usage = usageResult.ok ? usageResult.value : undefined;

  return (
    <SessionDetail
      replay={replayResult.value}
      flags={usage?.flags}
      durationMs={usage?.durationMs}
      deepLinkTurn={deepLinkTurn}
    />
  );
}

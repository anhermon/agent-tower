import Link from "next/link";
import { SessionDetail } from "@/components/sessions/session-detail";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { CLAUDE_DATA_ROOT_ENV, loadSessionOrUndefined } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await loadSessionOrUndefined(id);

  if (!result.ok) {
    return (
      <section className="space-y-5">
        <Link href="/sessions" className="text-sm text-accent hover:underline">
          ← Back to sessions
        </Link>
        {result.reason === "unconfigured" ? (
          <EmptyState
            title="No sessions records"
            description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory.`}
          />
        ) : result.reason === "not_found" ? (
          <EmptyState
            title="Session not found"
            description={`No transcript with id ${id} was found under the configured data root.`}
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

  return <SessionDetail transcript={result.transcript} />;
}

import Link from "next/link";
import { notFound } from "next/navigation";

import type { SessionUsageSummary } from "@control-plane/core";

import { SessionDetail } from "@/components/sessions/session-detail";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { loadReplay } from "@/lib/sessions-analytics";
import { CLAUDE_DATA_ROOT_ENV, loadSessionUsageOrEmpty } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SessionDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const qs = (await searchParams) ?? {};
  const deepLinkTurn = resolveDeepLinkTurn(qs.turn);

  const [replayResult, usageResult] = await Promise.all([
    loadReplay(id),
    loadSessionUsageOrEmpty(id),
  ]);

  if (!replayResult.ok) {
    return renderReplayError(replayResult);
  }

  if (!replayResult.value) {
    // Real 404 for unknown session ids (parallels /agents/[id]).
    notFound();
  }

  const { usage, usageError } = resolveUsage(usageResult);

  return (
    <>
      {usageError ? (
        <div
          role="status"
          className="mb-4 rounded-sm border border-warn/40 bg-warn/10 px-4 py-2 text-xs text-warn"
        >
          Usage summary unavailable: {usageError}
        </div>
      ) : null}
      <SessionDetail
        replay={replayResult.value}
        flags={usage?.flags}
        durationMs={usage?.durationMs}
        deepLinkTurn={deepLinkTurn}
      />
    </>
  );
}

function resolveUsage(usageResult: Awaited<ReturnType<typeof loadSessionUsageOrEmpty>>): {
  usage: SessionUsageSummary | undefined;
  usageError: string | null;
} {
  const usage = usageResult.ok ? usageResult.value : undefined;
  // Non-blocking banner when we can render the replay but usage (flags,
  // duration) failed to load for a real reason — previously swallowed silently.
  const usageError =
    !usageResult.ok && usageResult.reason === "error"
      ? (usageResult.message ?? "Could not load usage summary.")
      : null;
  return { usage, usageError };
}

function resolveDeepLinkTurn(rawTurn: string | string[] | undefined): string | undefined {
  if (typeof rawTurn === "string") return rawTurn;
  if (Array.isArray(rawTurn)) return rawTurn[0];
  return undefined;
}

function renderReplayError(replayResult: Awaited<ReturnType<typeof loadReplay>> & { ok: false }) {
  return (
    <section className="space-y-5">
      <Link href="/sessions" className="text-sm text-accent hover:underline">
        ← Back to sessions
      </Link>
      {replayResult.reason === "unconfigured" ? (
        <EmptyState
          title="No session records"
          description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory.`}
        />
      ) : (
        <ErrorState
          title="Could not load session"
          description={replayResult.message ?? "An unknown error occurred reading the transcript."}
        />
      )}
    </section>
  );
}

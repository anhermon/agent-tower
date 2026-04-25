import { ReplaySessionList } from "@/components/replay/replay-session-list";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { getModuleByKey } from "@/lib/modules";
import {
  CLAUDE_DATA_ROOT_ENV,
  getConfiguredDataRoot,
  listSessionsOrEmpty,
} from "@/lib/replay-source";

export const dynamic = "force-dynamic";

export default async function ReplayPage() {
  const mod = getModuleByKey("replay");
  const dataRoot = getConfiguredDataRoot();
  const result = await listSessionsOrEmpty();

  return (
    <section>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-normal text-ink">{mod.label}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          {mod.description} Configure with{" "}
          <code className="mx-1 rounded bg-soft px-1 py-0.5 font-mono text-xs text-ink">
            {CLAUDE_DATA_ROOT_ENV}
          </code>
          .
        </p>
        {dataRoot ? (
          <p className="mt-2 font-mono text-xs text-muted/80">data root: {dataRoot}</p>
        ) : null}
      </div>

      <ReplayBody result={result} />
    </section>
  );
}

type ListResult = Awaited<ReturnType<typeof listSessionsOrEmpty>>;

function ReplayBody({ result }: { result: ListResult }) {
  if (!result.ok && result.reason === "unconfigured") {
    return (
      <EmptyState
        title="No session records"
        description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory to populate this module.`}
      />
    );
  }

  if (!result.ok) {
    return (
      <ErrorState
        title="Could not list sessions"
        description={
          result.message ?? "An unknown error occurred reading the configured data root."
        }
      />
    );
  }

  if (result.sessions.length === 0) {
    return (
      <EmptyState
        title="No session records"
        description="The configured data root contains no Claude Code transcripts yet."
      />
    );
  }

  return <ReplaySessionList sessions={result.sessions} />;
}

import { SessionList } from "@/components/sessions/session-list";
import { Badge } from "@/components/ui/badge";
import { RefreshButton } from "@/components/ui/refresh-button";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { getModuleByKey } from "@/lib/modules";
import {
  CLAUDE_DATA_ROOT_ENV,
  getConfiguredDataRoot,
  listSessionsOrEmpty,
} from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const mod = getModuleByKey("sessions");
  const dataRoot = getConfiguredDataRoot();
  const result = await listSessionsOrEmpty();

  const status = dataRoot && result.ok ? "healthy" : "degraded";

  return (
    <section>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">{mod.label}</h1>
            <Badge state={status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Read-only view of local Claude Code transcripts. Configure with the
            <code className="mx-1 rounded bg-soft px-1 py-0.5 font-mono text-xs text-ink">
              {CLAUDE_DATA_ROOT_ENV}
            </code>
            environment variable.
          </p>
          {dataRoot ? (
            <p className="mt-2 font-mono text-xs text-muted/80" title={dataRoot}>
              data root: {dataRoot}
            </p>
          ) : null}
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2">
          <RefreshButton />
        </div>
      </div>

      <SessionsBody result={result} />
    </section>
  );
}

type ListResult = Awaited<ReturnType<typeof listSessionsOrEmpty>>;

function SessionsBody({ result }: { result: ListResult }) {
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

  const SESSIONS_PAGE_LIMIT = 200;
  const sessions = result.sessions.slice(0, SESSIONS_PAGE_LIMIT);
  const truncated = result.sessions.length > SESSIONS_PAGE_LIMIT;

  return (
    <>
      {truncated && (
        <p className="mb-3 text-xs text-muted">
          Showing most recent {SESSIONS_PAGE_LIMIT} of {result.sessions.length} sessions. Use search
          to find older sessions.
        </p>
      )}
      <SessionList sessions={sessions} />
    </>
  );
}

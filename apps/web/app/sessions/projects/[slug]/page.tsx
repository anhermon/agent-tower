import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectDetail } from "@/components/sessions/project-detail";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { loadProject } from "@/lib/sessions-analytics";
import {
  CLAUDE_DATA_ROOT_ENV,
  getConfiguredDataRoot,
  listSessionsOrEmpty,
  type SessionListing,
} from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

interface PageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function SessionsProjectDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const dataRoot = getConfiguredDataRoot();

  const [detail, listingsResult] = await Promise.all([loadProject(decoded), listSessionsOrEmpty()]);

  const status = dataRoot && detail.ok ? "healthy" : "degraded";

  return (
    <section>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/sessions/projects" className="text-xs text-cyan hover:underline">
              Projects
            </Link>
            <span aria-hidden="true" className="text-muted/50">
              /
            </span>
            <h1 className="text-2xl font-semibold tracking-normal text-ink">
              {detail.ok && detail.value ? detail.value.project.displayName : decoded}
            </h1>
            <Badge state={status} />
          </div>
        </div>
      </div>

      <Body
        detail={detail}
        listings={listingsResult.ok ? listingsResult.sessions : []}
        slug={decoded}
      />
    </section>
  );
}

type DetailResult = Awaited<ReturnType<typeof loadProject>>;

function Body({
  detail,
  listings,
  slug,
}: {
  readonly detail: DetailResult;
  readonly listings: readonly SessionListing[];
  readonly slug: string;
}) {
  if (!detail.ok && detail.reason === "unconfigured") {
    return (
      <EmptyState
        title="No projects"
        description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory to populate this view.`}
      />
    );
  }

  if (!detail.ok) {
    return (
      <ErrorState
        title="Could not load project"
        description={detail.message ?? "An unknown error occurred."}
      />
    );
  }

  if (!detail.value) {
    notFound();
  }

  if (detail.value.sessions.length === 0) {
    return (
      <EmptyState
        title="No sessions under this project"
        description={`The project slug "${slug}" exists but has no sessions yet, or they were all unreadable.`}
      />
    );
  }

  const listingsById: Record<string, SessionListing> = {};
  for (const listing of listings) {
    listingsById[listing.sessionId] = listing;
  }

  return (
    <ProjectDetail
      project={detail.value.project}
      sessions={detail.value.sessions}
      listings={listingsById}
    />
  );
}

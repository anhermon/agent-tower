import Link from "next/link";
import { ProjectCard } from "@/components/sessions/project-card";
import { ProjectSwitcher } from "@/components/sessions/project-switcher";
import { Badge } from "@/components/ui/badge";
import { RefreshButton } from "@/components/ui/refresh-button";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { listProjects } from "@/lib/sessions-analytics";
import { CLAUDE_DATA_ROOT_ENV, getConfiguredDataRoot } from "@/lib/sessions-source";

export const dynamic = "force-dynamic";

export default async function SessionsProjectsPage() {
  const dataRoot = getConfiguredDataRoot();
  const result = await listProjects();
  const status = dataRoot && result.ok ? "healthy" : "degraded";

  return (
    <section>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal text-ink">Projects</h1>
            <Badge state={status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Projects derived from the{" "}
            <code className="mx-1 rounded bg-soft px-1 py-0.5 font-mono text-xs text-ink">cwd</code>
            recorded in each transcript. Each card aggregates usage across every session under that
            working directory.{" "}
            <Link href="/sessions" className="text-cyan hover:underline">
              Sessions index →
            </Link>
          </p>
          {dataRoot ? (
            <p className="mt-2 font-mono text-xs text-muted/80" title={dataRoot}>
              data root: {dataRoot}
            </p>
          ) : null}
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2">
          {result.ok && result.value.length > 0 ? (
            <ProjectSwitcher projects={result.value} />
          ) : null}
          <RefreshButton />
        </div>
      </div>

      <Body result={result} />
    </section>
  );
}

type ListResult = Awaited<ReturnType<typeof listProjects>>;

function Body({ result }: { result: ListResult }) {
  if (!result.ok && result.reason === "unconfigured") {
    return (
      <EmptyState
        title="No projects"
        description={`Set ${CLAUDE_DATA_ROOT_ENV} to point at your Claude Code projects directory to populate this view.`}
      />
    );
  }

  if (!result.ok) {
    return (
      <ErrorState
        title="Could not list projects"
        description={
          result.message ?? "An unknown error occurred reading the configured data root."
        }
      />
    );
  }

  if (result.value.length === 0) {
    return (
      <EmptyState
        title="No projects"
        description="The configured data root contains no Claude Code transcripts yet."
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {result.value.map((project) => (
        <li key={project.id}>
          <ProjectCard project={project} />
        </li>
      ))}
    </ul>
  );
}

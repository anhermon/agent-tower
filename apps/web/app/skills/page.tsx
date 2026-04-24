import { resolveRangeFromSearchParams } from "@/components/sessions/date-range";
import { DateRangePicker } from "@/components/sessions/date-range-picker";
import { SkillGrid, SkillsEfficacyDashboard } from "@/components/skills/_lazy";
import { SkillsDashboard } from "@/components/skills/skills-dashboard";
import { ViewportMount } from "@/components/skills/viewport-mount";
import { Badge } from "@/components/ui/badge";
import { RefreshButton } from "@/components/ui/refresh-button";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { getModuleByKey } from "@/lib/modules";
import { computeSkillsEfficacy, type ListSkillsEfficacyResult } from "@/lib/skills-efficacy-source";
import {
  type ListSkillsResult,
  listSkillsOrEmpty,
  type ResolvedSkillsRoot,
  SKILLS_ROOTS_ENV,
  type SkillManifest,
} from "@/lib/skills-source";
import { computeSkillsUsage, type ListSkillsUsageResult } from "@/lib/skills-usage-source";

import type { SkillGridItem } from "@/components/skills/skill-grid";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SkillsPage({ searchParams }: { searchParams: SearchParams }) {
  const module = getModuleByKey("skills");
  const sp = await searchParams;
  const range = resolveRangeFromSearchParams(sp);
  const [result, usage, efficacy] = await Promise.all([
    listSkillsOrEmpty(),
    computeSkillsUsage({ range }),
    computeSkillsEfficacy({ range }),
  ]);
  const status = result.ok && result.skills.length > 0 ? "healthy" : "degraded";

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Module</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink md:text-[34px]">
              {module.label}
            </h1>
            <Badge state={status} />
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            Skill registry discovered from local <code className="font-mono text-xs">SKILL.md</code>{" "}
            files. Invocation volume and session-outcome efficacy are derived from local Claude Code
            transcripts. Read-only; nothing is written.
          </p>
          {result.ok && result.roots.length > 0 ? <RootList roots={result.roots} /> : null}
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2">
          <DateRangePicker />
          <RefreshButton />
        </div>
      </div>

      <UsageSection result={result} usage={usage} />
      <EfficacySection result={result} efficacy={efficacy} />
      <CatalogueSection result={result} />
    </section>
  );
}

function UsageSection({
  result,
  usage,
}: {
  readonly result: ListSkillsResult;
  readonly usage: ListSkillsUsageResult;
}) {
  if (!result.ok || result.skills.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="mb-6">
        <p className="eyebrow">Usage analytics</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          Invocation telemetry
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          How often each skill was invoked, how large it is on disk, and the rough token volume it
          has injected into conversations.
        </p>
      </div>
      {usage.ok ? (
        usage.report.totals.totalInvocations === 0 ? (
          <EmptyState
            title="No skill invocations found"
            description="Scanned local session transcripts but no Skill tool-use blocks were present. Invoke a skill via Claude Code and reload."
          />
        ) : (
          <SkillsDashboard report={usage.report} />
        )
      ) : usage.reason === "unconfigured" ? (
        <EmptyState
          title="No session data root"
          description="Set CLAUDE_CONTROL_PLANE_DATA_ROOT or create ~/.claude/projects so the dashboard can correlate invocations to skills."
        />
      ) : (
        <ErrorState
          title="Could not compute skill usage"
          description={
            usage.message ?? "An unknown error occurred reading Claude Code session transcripts."
          }
        />
      )}
    </div>
  );
}

function EfficacySection({
  result,
  efficacy,
}: {
  readonly result: ListSkillsResult;
  readonly efficacy: ListSkillsEfficacyResult;
}) {
  if (!result.ok || result.skills.length === 0) return null;

  return (
    <div className="mt-10 border-t border-line/60 pt-8">
      <div className="mb-6">
        <p className="eyebrow">Efficacy</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          Session outcome delta
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Each session is scored with a heuristic{" "}
          <code className="font-mono text-xs">effective = satisfaction × outcome</code>{" "}
          (completed=1.0, partial=0.7, abandoned=0.3, unknown=0.6). Skills are ranked by the delta
          between sessions that invoked them and the global baseline. Qualifying threshold: ≥3
          sessions.
        </p>
      </div>
      {efficacy.ok ? (
        efficacy.report.sessionsAnalyzed === 0 ? (
          <EmptyState
            title="No sessions to score"
            description="No Claude Code session transcripts were found under the configured data root."
          />
        ) : (
          <ViewportMount minHeight={480}>
            <SkillsEfficacyDashboard report={efficacy.report} />
          </ViewportMount>
        )
      ) : efficacy.reason === "unconfigured" ? (
        <EmptyState
          title="No session data root"
          description="Set CLAUDE_CONTROL_PLANE_DATA_ROOT or create ~/.claude/projects so efficacy can be computed."
        />
      ) : (
        <ErrorState
          title="Could not compute skill efficacy"
          description={efficacy.message ?? "An unknown error occurred scoring session transcripts."}
        />
      )}
    </div>
  );
}

function CatalogueSection({ result }: { readonly result: ListSkillsResult }) {
  return (
    <div
      className="mt-10 border-t border-line/60 pt-8"
      style={{ contentVisibility: "auto", containIntrinsicSize: "1200px" }}
    >
      <div className="mb-6">
        <p className="eyebrow">Catalogue</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Discovered skills</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Every <code className="font-mono text-xs">SKILL.md</code> under the configured roots.
          Click a card for the full manifest.
        </p>
      </div>
      <SkillsBody result={result} />
    </div>
  );
}

function SkillsBody({ result }: { result: ListSkillsResult }) {
  if (!result.ok && result.reason === "unconfigured") {
    return (
      <EmptyState
        title="No skills roots"
        description={`Set ${SKILLS_ROOTS_ENV} (one or more directories joined by the OS path delimiter) or create ~/.claude/skills to populate this module.`}
      />
    );
  }

  if (!result.ok) {
    return (
      <ErrorState
        title="Could not list skills"
        description={
          result.message ?? "An unknown error occurred reading the configured skills roots."
        }
      />
    );
  }

  if (result.skills.length === 0) {
    return (
      <EmptyState
        title="No skills discovered"
        description="No SKILL.md files were found under the configured roots."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SummaryStrip skills={result.skills} roots={result.roots} />
      <ViewportMount minHeight={800}>
        <SkillGrid skills={result.skills.map(toGridItem)} />
      </ViewportMount>
    </div>
  );
}

function toGridItem(skill: SkillManifest): SkillGridItem {
  // Drop `body` and `frontmatter` before the client boundary — individual
  // SKILL.md bodies can be multi-megabyte, and serialising them into the RSC
  // flight payload bloats the page past the browser's ability to render.
  return {
    id: skill.id,
    name: skill.name,
    summary: skill.summary,
    description: skill.description,
    triggers: skill.triggers,
    rootDirectory: skill.rootDirectory,
    rootLabel: skill.rootLabel,
    relativePath: skill.relativePath,
    modifiedAt: skill.modifiedAt,
    sizeBytes: skill.sizeBytes,
  };
}

function RootList({ roots }: { roots: readonly ResolvedSkillsRoot[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {roots.map((root) => (
        <li
          key={root.directory}
          className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-muted"
          title={root.directory}
        >
          <span className="text-muted-strong">{root.label}</span>
          <span className="text-muted/70">({root.origin})</span>
        </li>
      ))}
    </ul>
  );
}

function SummaryStrip({
  skills,
  roots,
}: {
  readonly skills: readonly SkillManifest[];
  readonly roots: readonly ResolvedSkillsRoot[];
}) {
  const withTriggers = skills.filter((skill) => skill.triggers.length > 0).length;
  const withDescription = skills.filter((skill) => skill.description).length;
  const items: readonly { readonly label: string; readonly value: string }[] = [
    { label: "Skills", value: String(skills.length) },
    { label: "Roots scanned", value: String(roots.length) },
    { label: "With description", value: String(withDescription) },
    { label: "With triggers", value: String(withTriggers) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="glass-panel-soft rounded-sm p-3">
          <dt className="eyebrow">{item.label}</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

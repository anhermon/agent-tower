import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { formatBytes, formatRelative } from "@/lib/format";
import { SKILLS_ROOTS_ENV, loadSkillOrUndefined } from "@/lib/skills-source";
import {
  computeSkillsUsage,
  type SkillUsageStats
} from "@/lib/skills-usage-source";
import {
  formatShortDate,
  formatTokens
} from "@/components/skills/format-usage";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SkillDetailPage({ params }: PageProps) {
  const { id } = await params;
  const decodedId = safeDecode(id);
  const [result, usage] = await Promise.all([
    loadSkillOrUndefined(decodedId),
    computeSkillsUsage()
  ]);

  if (!result.ok) {
    return (
      <section className="space-y-5">
        <Link href="/skills" className="text-sm text-cyan hover:underline">
          ← Back to skills
        </Link>
        {result.reason === "unconfigured" ? (
          <EmptyState
            title="No skills roots"
            description={`Set ${SKILLS_ROOTS_ENV} or create ~/.claude/skills to populate the Skills module.`}
          />
        ) : result.reason === "not_found" ? (
          <EmptyState
            title="Skill not found"
            description={`No skill with id ${decodedId} was found under the configured roots.`}
          />
        ) : (
          <ErrorState
            title="Could not load skill"
            description={result.message ?? "An unknown error occurred reading the configured roots."}
          />
        )}
      </section>
    );
  }

  const { skill } = result;
  const stats = usage.ok
    ? usage.report.perSkill.find(
        (entry) => entry.skillId === skill.id || entry.skillId === skill.name
      ) ?? null
    : null;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/skills" className="text-cyan hover:underline">
          ← Back to skills
        </Link>
        <span className="font-mono text-xs text-muted" title={skill.id}>
          {skill.id}
        </span>
      </div>

      <header className="glass-panel accent-gradient-subtle relative overflow-hidden rounded-lg p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Skill</p>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-ink md:text-[28px]">
              {skill.name}
            </h1>
            <p
              className="mt-2 break-all font-mono text-xs text-muted"
              title={skill.filePath}
            >
              {skill.filePath}
            </p>
          </div>
          <span
            className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-muted"
            title={skill.rootDirectory}
          >
            <span className="text-muted-strong">{skill.rootLabel}</span>
            <span className="text-muted/70">({skill.rootOrigin})</span>
          </span>
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Id" value={skill.id} mono />
          <Stat label="Root label" value={skill.rootLabel} mono />
          <Stat label="Size" value={formatBytes(skill.sizeBytes)} />
          <Stat
            label="Last modified"
            value={formatRelative(skill.modifiedAt)}
            hint={skill.modifiedAt}
          />
        </dl>
      </header>

      <UsageBlock stats={stats} />

      {skill.description ? (
        <section>
          <p className="eyebrow">Description</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
            {skill.description}
          </p>
        </section>
      ) : null}

      {skill.triggers.length > 0 ? (
        <section>
          <p className="eyebrow">Trigger phrases</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {skill.triggers.map((trigger) => (
              <span
                key={trigger}
                className="inline-flex rounded-full border border-info/40 bg-info/10 px-3 py-1 font-mono text-xs text-info"
              >
                {trigger}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {hasFrontmatter(skill.frontmatter) ? (
        <section>
          <p className="eyebrow">Frontmatter</p>
          <pre className="mt-2 overflow-x-auto rounded-xs border border-line/60 bg-black/30 p-3 font-mono text-xs leading-6 text-ink">
            {JSON.stringify(skill.frontmatter, null, 2)}
          </pre>
        </section>
      ) : null}

      <section>
        <p className="eyebrow">Body</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-xs border border-line/60 bg-black/20 p-4 font-mono text-xs leading-6 text-ink">
          {skill.body.length > 0 ? skill.body : "(empty)"}
        </pre>
      </section>
    </section>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasFrontmatter(value: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(value).length > 0;
}

function UsageBlock({ stats }: { readonly stats: SkillUsageStats | null }) {
  if (!stats || stats.invocationCount === 0) {
    return (
      <section>
        <p className="eyebrow">Usage</p>
        <p className="mt-2 text-sm text-muted">
          No invocations of this skill were found in local session transcripts.
        </p>
      </section>
    );
  }
  const peakHour = stats.perHourOfDay.reduce(
    (acc, count, hour) => (count > acc.count ? { hour, count } : acc),
    { hour: 0, count: 0 }
  );
  const maxHour = Math.max(1, ...stats.perHourOfDay);
  return (
    <section className="space-y-4">
      <p className="eyebrow">Usage</p>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invocations" value={stats.invocationCount.toLocaleString()} />
        <Stat label="Tokens injected" value={formatTokens(stats.tokensInjected)} />
        <Stat label="Bytes injected" value={formatBytes(stats.bytesInjected)} />
        <Stat
          label="Last invoked"
          value={formatShortDate(stats.lastInvokedAt)}
          hint={stats.firstInvokedAt ? `since ${formatShortDate(stats.firstInvokedAt)}` : undefined}
        />
      </dl>

      <div className="glass-panel rounded-md p-4">
        <p className="eyebrow">Hour of day (UTC)</p>
        <div className="mt-3 grid grid-cols-24 gap-[2px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {stats.perHourOfDay.map((count, hour) => {
            const intensity = count / maxHour;
            const lightness = 18 + Math.round(intensity * 46);
            const alpha = count === 0 ? 0.08 : 0.15 + intensity * 0.85;
            return (
              <div
                key={hour}
                title={`${hour.toString().padStart(2, "0")}:00 UTC · ${count}`}
                className="h-5 rounded-[2px] border border-line/40"
                style={{ backgroundColor: `hsl(200 80% ${lightness}% / ${alpha})` }}
              />
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Peak: {String(peakHour.hour).padStart(2, "0")}:00 UTC · {peakHour.count} invocations
        </p>
      </div>

      {stats.perProject.length > 0 ? (
        <div className="glass-panel rounded-md p-4">
          <p className="eyebrow">By project</p>
          <ul className="mt-3 space-y-1.5">
            {stats.perProject.slice(0, 8).map((row) => {
              const pct = Math.max(2, Math.round((row.count / stats.invocationCount) * 100));
              return (
                <li key={row.cwd} className="flex items-center gap-3 text-xs text-muted">
                  <span className="w-10 shrink-0 text-right font-mono text-muted-strong">
                    {row.count}
                  </span>
                  <span className="relative h-2 flex-1 rounded-full bg-white/[0.04]">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-info/70"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="min-w-0 flex-[2] truncate font-mono text-[11px]" title={row.cwd}>
                    {row.cwd}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  mono
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="glass-panel-soft rounded-xs p-3">
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 text-sm text-ink ${mono ? "break-all font-mono text-xs" : ""}`}>
        {value}
        {hint ? <span className="ml-2 font-mono text-xs text-muted/80">{hint}</span> : null}
      </dd>
    </div>
  );
}

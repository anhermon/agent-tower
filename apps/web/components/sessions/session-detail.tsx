import Link from "next/link";
import type { JsonObject } from "@control-plane/core";
import type { NormalizedTranscript } from "@control-plane/adapter-claude-code";
import { Collapsible } from "@/components/sessions/collapsible";
import { TurnBlock } from "@/components/sessions/turn-block";
import { formatRelative } from "@/lib/format";

type SessionDetailProps = {
  transcript: NormalizedTranscript;
};

export function SessionDetail({ transcript }: SessionDetailProps) {
  const { session, turns, toolCalls } = transcript;
  const metadata = (session.metadata ?? {}) as JsonObject;
  const model = typeof metadata.model === "string" ? metadata.model : "—";
  const cwd = typeof metadata.cwd === "string" ? metadata.cwd : "—";

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/sessions" className="text-cyan hover:underline">
          ← Back to sessions
        </Link>
        <span className="font-mono text-xs text-muted" title={session.id}>
          {session.id}
        </span>
      </div>

      <header className="glass-panel accent-gradient-subtle relative overflow-hidden rounded-lg p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Session</p>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-ink md:text-[28px]">
              {session.title ?? <span className="text-muted">Untitled session</span>}
            </h1>
            <p className="mt-2 break-all font-mono text-xs text-muted">{session.id}</p>
          </div>
          <div className="text-right">
            <p className="eyebrow">Runtime</p>
            <p className="mt-2 text-sm font-medium capitalize text-ink">{session.runtime}</p>
          </div>
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="State" value={session.state} />
          <Stat label="Model" value={model} mono />
          <Stat label="Turns" value={String(turns.length)} />
          <Stat label="Tool calls" value={String(toolCalls.length)} />
          <Stat label="Created" value={`${formatRelative(session.createdAt)}`} hint={session.createdAt} />
          <Stat label="Updated" value={`${formatRelative(session.updatedAt)}`} hint={session.updatedAt} />
          <Stat label="cwd" value={cwd} mono wide />
        </dl>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {turns.length === 0 ? (
            <div className="rounded-md border border-dashed border-line/70 bg-white/[0.02] p-6 text-center text-sm text-muted">
              No turns in this transcript.
            </div>
          ) : (
            turns.map((turn) => <TurnBlock key={turn.id} turn={turn} />)
          )}
        </div>

        <aside className="space-y-4">
          <MetadataDrawer metadata={metadata} />
        </aside>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  mono,
  wide
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={`glass-panel-soft rounded-xs p-3 ${
        wide ? "col-span-2 md:col-span-4" : ""
      }`}
    >
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 text-sm text-ink ${mono ? "break-all font-mono text-xs" : ""}`}>
        {value}
        {hint ? <span className="ml-2 font-mono text-xs text-muted/80">{hint}</span> : null}
      </dd>
    </div>
  );
}

function MetadataDrawer({ metadata }: { metadata: JsonObject }) {
  const pretty = JSON.stringify(metadata, null, 2);
  const preview = pretty.length > 800 ? `${pretty.slice(0, 800)}\n…` : pretty;

  return (
    <section className="glass-panel rounded-md p-5">
      <p className="eyebrow">Drill-down</p>
      <h2 className="mt-1 text-base font-semibold text-ink">Raw metadata</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Preserved adapter metadata. Read-only.
      </p>
      <div className="mt-3">
        <Collapsible preview={preview} full={pretty} />
      </div>
    </section>
  );
}

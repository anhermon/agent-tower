import type { JsonValue, ReplayData } from "@control-plane/core";

interface Props {
  readonly replay: ReplayData;
}

interface FileTouch {
  readonly path: string;
  readonly counts: { read: number; write: number; edit: number };
}

/**
 * Summarises distinct file paths touched in this session. Derives the list
 * from tool_use inputs (Read/Write/Edit/MultiEdit). Each row links to the
 * read-only file preview endpoint that scopes paths to the session's cwd.
 */
export function ExplorerPanel({ replay }: Props) {
  const touches = aggregate(replay);
  if (touches.length === 0) return null;

  return (
    <section className="glass-panel rounded-md p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="eyebrow">Files edited</h3>
        <span className="font-mono text-[10px] text-muted">{touches.length} paths</span>
      </div>
      <ul className="mt-2 divide-y divide-line/40">
        {touches.slice(0, 40).map((t) => (
          <li key={t.path} className="flex items-center gap-2 py-1.5">
            <a
              href={`/sessions/${encodeURIComponent(replay.sessionId)}/file?path=${encodeURIComponent(t.path)}`}
              className="min-w-0 flex-1 truncate font-mono text-xs text-cyan hover:underline"
              title={t.path}
            >
              {shorten(t.path)}
            </a>
            <span className="flex shrink-0 gap-1 font-mono text-[10px] text-muted">
              {t.counts.read > 0 ? <span className="text-muted/80">r×{t.counts.read}</span> : null}
              {t.counts.write > 0 ? <span className="text-info">w×{t.counts.write}</span> : null}
              {t.counts.edit > 0 ? <span className="text-ok">e×{t.counts.edit}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {touches.length > 40 ? (
        <p className="mt-2 text-[10px] text-muted/60">… {touches.length - 40} more paths</p>
      ) : null}
    </section>
  );
}

function aggregate(replay: ReplayData): readonly FileTouch[] {
  const byPath = new Map<string, { read: number; write: number; edit: number }>();
  const bump = (p: string, kind: "read" | "write" | "edit"): void => {
    const entry = byPath.get(p) ?? { read: 0, write: 0, edit: 0 };
    entry[kind] += 1;
    byPath.set(p, entry);
  };

  for (const turn of replay.turns) {
    if (!turn.toolCalls) continue;
    for (const tc of turn.toolCalls) {
      const file = filePathFromInput(tc.input);
      if (!file) continue;
      if (tc.name === "Read") bump(file, "read");
      else if (tc.name === "Write") bump(file, "write");
      else if (tc.name === "Edit" || tc.name === "MultiEdit") bump(file, "edit");
    }
  }

  return Array.from(byPath, ([path, counts]) => ({ path, counts })).sort(
    (a, b) => totalOf(b.counts) - totalOf(a.counts)
  );
}

function totalOf(c: { read: number; write: number; edit: number }): number {
  return c.read + c.write + c.edit;
}

function filePathFromInput(input: JsonValue): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, JsonValue>;
  const fp = obj.file_path;
  if (typeof fp === "string" && fp.length > 0) return fp;
  const path = obj.path;
  if (typeof path === "string" && path.length > 0) return path;
  return null;
}

function shorten(p: string): string {
  if (p.length <= 80) return p;
  const parts = p.split("/");
  if (parts.length <= 3) return `…${p.slice(-78)}`;
  const file = parts[parts.length - 1] ?? p;
  const head = parts.slice(0, 2).join("/");
  return `${head}/…/${file}`;
}

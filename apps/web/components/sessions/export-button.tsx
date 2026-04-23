"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Export button — triggers download of a canonical JSON bundle via the
 * `/api/sessions/export` endpoint. The scope prop controls which sessions the
 * bundle contains:
 *
 *   - `"session"` — single session identified by `sessionId`.
 *   - `"project"` — all sessions in the given `projectId`.
 *   - `"all"` — entire data root (honors the current `from`/`to` range if set).
 *
 * Uses the same-origin fetch pipeline rather than a raw `<a download>`
 * because we want to surface server-side failures inline rather than the
 * browser's generic "file could not be saved" dialog.
 */

export interface ExportButtonProps {
  readonly scope: "session" | "project" | "all";
  readonly sessionId?: string;
  readonly projectId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly label?: string;
  readonly className?: string;
}

export function ExportButton({
  scope,
  sessionId,
  projectId,
  from,
  to,
  label,
  className,
}: ExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("scope", scope);
      if (scope === "session" && sessionId) params.set("ids", sessionId);
      if (scope === "project" && projectId) params.set("projectId", projectId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const url = `/api/sessions/export?${params.toString()}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename =
        filenameMatch?.[1] ??
        `control-plane-sessions-${new Date().toISOString().slice(0, 10)}.json`;

      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [scope, sessionId, projectId, from, to]);

  return (
    <div className={cn("inline-flex flex-col items-end gap-1", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-xs border border-line/60 px-3 font-mono text-xs",
          busy ? "cursor-wait text-muted" : "text-muted hover:border-cyan hover:text-cyan"
        )}
      >
        {busy ? "Exporting…" : (label ?? "Export JSON")}
      </button>
      {error ? (
        <span className="font-mono text-[11px] text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

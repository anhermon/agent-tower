import "server-only";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { VersionRecord } from "@control-plane/core";
import { formatBytes } from "@/lib/format";
import { getConfiguredDataRoot } from "@/lib/sessions-source";

/**
 * Server component showing "what's on disk":
 *   - list of detected Claude Code versions (from the analytics tool analytics
 *     version records),
 *   - current-run version heuristic (newest-seen by `lastSeen`),
 *   - total storage bytes aggregated across the configured data root.
 *
 * Renders an honest empty state when the data root is unconfigured — no
 * fabricated numbers, no placeholder charts.
 */

export interface SystemInfoPanelProps {
  /** Version rows from `ToolAnalytics.versions`. Optional — omit to hide. */
  readonly versions?: readonly VersionRecord[];
}

export async function SystemInfoPanel({ versions }: SystemInfoPanelProps) {
  const dataRoot = getConfiguredDataRoot();

  if (!dataRoot) {
    return (
      <article className="glass-panel rounded-md p-5">
        <header className="mb-3">
          <h2 className="text-base font-semibold text-ink">System info</h2>
          <p className="mt-0.5 text-xs text-muted">
            Data root is not configured — set{" "}
            <code className="font-mono text-[11px]">CLAUDE_CONTROL_PLANE_DATA_ROOT</code> to
            populate this panel.
          </p>
        </header>
      </article>
    );
  }

  const bytes = await computeDiskBytes(dataRoot);
  const sortedVersions = versions ? [...versions].sort(byLastSeen) : [];
  const currentVersion = sortedVersions[0];

  return (
    <article className="glass-panel rounded-md p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-ink">System info</h2>
        <p className="mt-0.5 text-xs text-muted">
          Detected versions and storage footprint on the configured data root.
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Current version" value={currentVersion?.version ?? "—"} />
        <Stat
          label="Versions seen"
          value={sortedVersions.length > 0 ? String(sortedVersions.length) : "—"}
        />
        <Stat label="Storage used" value={bytes != null ? formatBytes(bytes) : "—"} />
      </dl>

      {sortedVersions.length > 1 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="pb-1">Version</th>
                <th className="pb-1">Sessions</th>
                <th className="pb-1">First seen</th>
                <th className="pb-1">Last seen</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums text-ink">
              {sortedVersions.slice(0, 6).map((row) => (
                <tr key={row.version} className="border-t border-line/40">
                  <td className="py-1 pr-3">{row.version}</td>
                  <td className="py-1 pr-3">{row.sessionCount}</td>
                  <td className="py-1 pr-3">{row.firstSeen.slice(0, 10)}</td>
                  <td className="py-1">{row.lastSeen.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="mt-3 font-mono text-[11px] text-muted/70" title={dataRoot}>
        data root: {dataRoot}
      </p>
    </article>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="glass-panel-soft rounded-xs p-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function byLastSeen(a: VersionRecord, b: VersionRecord): number {
  return b.lastSeen.localeCompare(a.lastSeen);
}

async function computeDiskBytes(rootDir: string): Promise<number | null> {
  try {
    let total = 0;
    const projectDirs = await readdir(rootDir);
    for (const name of projectDirs) {
      const dir = path.join(rootDir, name);
      const dirStat = await safeStat(dir);
      if (!dirStat?.isDirectory()) continue;
      const files = await readdir(dir).catch(() => [] as string[]);
      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const fileStat = await safeStat(path.join(dir, file));
        if (fileStat?.isFile()) total += fileStat.size;
      }
    }
    return total;
  } catch {
    return null;
  }
}

async function safeStat(target: string) {
  try {
    return await stat(target);
  } catch {
    return null;
  }
}

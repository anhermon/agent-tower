import type { VersionRecord } from "@control-plane/core";

interface Props {
  readonly versions: readonly VersionRecord[];
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function VersionHistoryTable({ versions }: Props) {
  if (versions.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted">
        No version metadata captured
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] font-mono">
        <thead>
          <tr className="border-b border-line/70">
            {["Version", "Sessions", "First Seen", "Last Seen"].map((h) => (
              <th
                key={h}
                scope="col"
                className={`eyebrow py-2 ${h === "Version" ? "text-left" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {versions.map((v, i) => (
            <tr
              key={v.version}
              className={`border-b border-line/30 hover:bg-soft/30 ${i === 0 ? "text-ok" : "text-ink/75"}`}
            >
              <td className="py-2 font-bold">{v.version}</td>
              <td className="py-2 text-right">{v.sessionCount.toLocaleString()}</td>
              <td className="py-2 text-right text-muted">{fmtDate(v.firstSeen)}</td>
              <td className="py-2 text-right text-muted">{fmtDate(v.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { BranchRow } from "@control-plane/core";

interface Props {
  readonly branches: readonly BranchRow[];
}

export function BranchLeaderboard({ branches }: Props) {
  if (branches.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted">
        No git branch metadata captured
      </div>
    );
  }
  const ranked = [...branches].sort((a, b) => b.turnCount - a.turnCount).slice(0, 20);
  const max = ranked[0]?.turnCount ?? 1;

  return (
    <ul className="space-y-2">
      {ranked.map(({ branch, turnCount }) => {
        const width = Math.max(4, Math.round((turnCount / max) * 100));
        return (
          <li key={branch} className="flex items-center gap-3">
            <span className="w-32 truncate font-mono text-sm text-muted" title={branch}>
              {branch}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-soft/60">
              <div className="h-full rounded-full bg-ok/60" style={{ width: `${width}%` }} />
            </div>
            <span className="w-28 text-right text-xs text-muted tabular-nums">
              {turnCount.toLocaleString()} turns
            </span>
          </li>
        );
      })}
    </ul>
  );
}

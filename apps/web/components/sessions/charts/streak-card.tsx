import type { StreakStats } from "@control-plane/core";

interface Props {
  readonly streaks: StreakStats;
  readonly totalActiveDays: number;
}

export function StreakCard({ streaks, totalActiveDays }: Props) {
  const mostActive =
    streaks.mostActiveDate && streaks.mostActiveDayMessageCount > 0 ? streaks.mostActiveDate : null;
  return (
    <div className="grid grid-cols-2 gap-3 text-[13px]">
      <div className="rounded-sm border border-line/60 bg-panel/60 p-3">
        <p className="eyebrow">Current Streak</p>
        <p className="mt-1 font-mono text-2xl font-bold text-ink">{streaks.currentStreakDays}</p>
        <p className="text-xs text-muted/80">consecutive days</p>
      </div>
      <div className="rounded-sm border border-line/60 bg-panel/60 p-3">
        <p className="eyebrow">Longest Streak</p>
        <p className="mt-1 font-mono text-2xl font-bold text-info">{streaks.longestStreakDays}</p>
        <p className="text-xs text-muted/80">consecutive days</p>
      </div>
      <div className="rounded-sm border border-line/60 bg-panel/60 p-3">
        <p className="eyebrow">Active Days</p>
        <p className="mt-1 font-mono text-2xl font-bold text-ink">{totalActiveDays}</p>
        <p className="text-xs text-muted/80">total days with activity</p>
      </div>
      {mostActive ? (
        <div className="rounded-sm border border-line/60 bg-panel/60 p-3">
          <p className="eyebrow">Most Active Day</p>
          <p className="mt-1 font-mono text-sm font-bold text-ok">{mostActive}</p>
          <p className="text-xs text-muted/80">
            {streaks.mostActiveDayMessageCount.toLocaleString()} messages
          </p>
        </div>
      ) : (
        <div className="rounded-sm border border-dashed border-line/60 p-3 text-xs text-muted/70">
          Most active day not yet determined
        </div>
      )}
    </div>
  );
}

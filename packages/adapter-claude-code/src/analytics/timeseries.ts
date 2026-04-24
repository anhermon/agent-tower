import type {
  DateRange,
  DayOfWeekBin,
  HourBin,
  SessionUsageSummary,
  StreakStats,
  Timeseries,
  TimeseriesPoint,
} from "@control-plane/core";

export interface TimeseriesFoldOptions {
  readonly range?: DateRange;
  /** Seed the "today" date for streak continuity. Accepts any ISO date. When
   *  omitted, the current streak is conservatively reported as 0 — keeping the
   *  fold fully deterministic. */
  readonly now?: string;
}

/**
 * Fold per-session summaries into the canonical `Timeseries` shape (daily
 * activity, peak hours, day-of-week, streaks). Pure: no clocks, no I/O. The
 * caller passes a `now` if it wants a non-zero current streak.
 */
export function foldTimeseries(
  sessions: readonly SessionUsageSummary[],
  options: TimeseriesFoldOptions = {}
): Timeseries {
  // Bucket by UTC calendar date of session start.
  const daily = new Map<string, Mutable<TimeseriesPoint>>();
  const hourCounts = new Array<number>(24).fill(0);
  const dowCounts: Mutable<DayOfWeekBin>[] = [];
  for (let day = 0; day < 7; day++) {
    dowCounts.push({ day: day as 0 | 1 | 2 | 3 | 4 | 5 | 6, sessionCount: 0, messageCount: 0 });
  }

  const activeDates = new Set<string>();

  let minDate: string | undefined;
  let maxDate: string | undefined;

  for (const s of sessions) {
    if (!s.startTime) continue;
    const ts = Date.parse(s.startTime);
    if (!Number.isFinite(ts)) continue;
    const date = toDate(ts);
    const hour = new Date(ts).getUTCHours();
    const day = new Date(ts).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;

    const messageCount = s.userMessageCount + s.assistantMessageCount;
    const toolCallCount = Object.values(s.toolCounts).reduce((a, b) => a + b, 0);

    const bucket = daily.get(date) ?? {
      date,
      sessionCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      estimatedCostUsd: 0,
    };
    bucket.sessionCount += 1;
    bucket.messageCount += messageCount;
    bucket.toolCallCount += toolCallCount;
    bucket.estimatedCostUsd += s.estimatedCostUsd;
    daily.set(date, bucket);

    hourCounts[hour] = (hourCounts[hour] ?? 0) + messageCount;
    const dow = dowCounts[day];
    if (dow) {
      dow.sessionCount += 1;
      dow.messageCount += messageCount;
    }

    activeDates.add(date);
  }

  const dailyArr = [...daily.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const peakHours: HourBin[] = hourCounts.map((messageCount, hour) => ({ hour, messageCount }));
  const dayOfWeek: DayOfWeekBin[] = dowCounts;

  const baseStreaks = computeStreaks(activeDates, options.now);

  // Enrich streaks with the most-active-day message count by scanning daily
  // buckets. `computeStreaks` alone has no access to per-day counts, so it
  // leaves `mostActiveDayMessageCount` at 0; here we have the data.
  let mostActiveDate: string | null = baseStreaks.mostActiveDate;
  let mostActiveDayMessageCount = 0;
  for (const point of dailyArr) {
    if (point.messageCount > mostActiveDayMessageCount) {
      mostActiveDayMessageCount = point.messageCount;
      mostActiveDate = point.date;
    }
  }
  const streaks: StreakStats = {
    ...baseStreaks,
    mostActiveDate,
    mostActiveDayMessageCount,
  };

  const range: DateRange = options.range ?? {
    from: minDate ?? "1970-01-01",
    to: maxDate ?? "1970-01-01",
  };

  return {
    range,
    daily: dailyArr,
    peakHours,
    dayOfWeek,
    streaks,
  };
}

export function computeStreaks(activeDates: ReadonlySet<string>, now?: string): StreakStats {
  if (activeDates.size === 0) {
    return {
      currentStreakDays: 0,
      longestStreakDays: 0,
      mostActiveDate: null,
      mostActiveDayMessageCount: 0,
    };
  }
  const sorted = [...activeDates].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const current = sorted[i]!;
    if (daysBetween(prev, current) === 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  let currentStreakDays = 0;
  const lastActive = sorted[sorted.length - 1]!;
  if (now) {
    const gap = daysBetween(lastActive, now);
    if (gap <= 1) {
      currentStreakDays = 1;
      for (let i = sorted.length - 2; i >= 0; i--) {
        const prev = sorted[i]!;
        if (daysBetween(prev, sorted[i + 1]!) === 1) {
          currentStreakDays += 1;
        } else {
          break;
        }
      }
    }
  }

  return {
    currentStreakDays,
    longestStreakDays: longest,
    mostActiveDate: lastActive,
    mostActiveDayMessageCount: 0,
  };
}

function toDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Stats timeline window helpers (jits-02vo.4). The Stats screen's
 * 30D / 90D / 1Y / ALL chips pick a window; the window becomes the `p_since`
 * argument of get_match_history, get_elo_history and
 * get_submission_breakdown (ALL = no lower bound).
 */
import type { WeeklyActivity } from "../types/analytics";

export type StatsWindow = "30d" | "90d" | "1y" | "all";

export const STATS_WINDOWS: { value: StatsWindow; label: string }[] = [
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const WINDOW_DAYS: Record<Exclude<StatsWindow, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/**
 * The ISO `p_since` for a window: now minus 30 / 90 / 365 days, or null for
 * ALL (the RPCs treat null as all time).
 */
export function statsWindowSince(window: StatsWindow, now: Date = new Date()): string | null {
  if (window === "all") return null;
  return new Date(now.getTime() - WINDOW_DAYS[window] * DAY_MS).toISOString();
}

/**
 * Count matches per week for the last 8 weeks (oldest first), labelled by
 * the Monday of each week ("M/D"). Only the rows passed in are counted, so
 * a windowed history yields in-window activity only.
 */
export function buildWeeklyActivity(
  history: readonly { completed_at: string; athlete_outcome: string | null }[],
  now: Date = new Date(),
): WeeklyActivity[] {
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * DAY_MS);

  const weeks: WeeklyActivity[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - i * 7 * DAY_MS);
    const mon = new Date(weekStart);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    weeks.push({ week: `${mon.getMonth() + 1}/${mon.getDate()}`, matches: 0, wins: 0 });
  }

  for (const m of history) {
    const d = new Date(m.completed_at);
    if (d < eightWeeksAgo) continue;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / DAY_MS);
    const weekIndex = 7 - Math.floor(diffDays / 7);
    if (weekIndex >= 0 && weekIndex < 8) {
      weeks[weekIndex].matches++;
      if (m.athlete_outcome === "win") weeks[weekIndex].wins++;
    }
  }

  return weeks;
}

export interface EloProgression {
  /** Ratings oldest to newest: the first row's rating_before, then each rating_after. */
  points: number[];
  /** rating_before of the earliest row in the window (current ELO when empty). */
  start: number;
  /** rating_after of the latest row in the window (current ELO when empty). */
  end: number;
  /** end - start */
  delta: number;
  /** Number of rated matches in the window. */
  matches: number;
  /**
   * created_at of the earliest / latest row. For an empty window these fall
   * back to the window bounds when given (the window's since and "now"; ALL
   * has no start), else null.
   */
  startDate: string | null;
  endDate: string | null;
}

/**
 * Turn get_elo_history rows (any order; the RPC returns newest first) into
 * the ELO Progression series. An empty window is a flat line at the
 * athlete's current ELO with 0 matches; pass `bounds` so its x-axis can
 * still carry the window's dates.
 *
 * Known drift (backend data model): elo_history.created_at is not always the
 * match's completed_at (an overturned dispute re-inserts rows at now()), so
 * this series can disagree slightly with the windowed record/match list.
 */
export function buildEloProgression(
  rows: readonly { rating_before: number; rating_after: number; created_at: string }[],
  currentElo: number,
  bounds?: { since: string | null; now?: Date },
): EloProgression {
  if (rows.length === 0) {
    return {
      points: [currentElo, currentElo],
      start: currentElo,
      end: currentElo,
      delta: 0,
      matches: 0,
      startDate: bounds?.since ?? null,
      endDate: bounds ? (bounds.now ?? new Date()).toISOString() : null,
    };
  }
  const asc = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const first = asc[0];
  const last = asc[asc.length - 1];
  return {
    points: [first.rating_before, ...asc.map((r) => r.rating_after)],
    start: first.rating_before,
    end: last.rating_after,
    delta: last.rating_after - first.rating_before,
    matches: asc.length,
    startDate: first.created_at,
    endDate: last.created_at,
  };
}

/**
 * Round-number gridlines for the progression chart: at most 5 lines, spaced
 * by a "nice" step, spanning every point. A flat series still gets a band
 * around it so the line sits mid-chart.
 */
export function eloGridTicks(points: readonly number[]): number[] {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const steps = [10, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => Math.ceil(max / s) - Math.floor(min / s) <= 4) ?? 1000;
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (lo === hi) {
    lo -= step;
    hi += step;
  }
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return ticks;
}

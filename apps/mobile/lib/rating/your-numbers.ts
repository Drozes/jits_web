/**
 * Your numbers (jits-1ez5.2): the values the header rating's sheet derives
 * from the dashboard summary, the auth row and the rating history (the
 * sparkline and "this month"). Pure, so the sheet stays a view.
 */
import type { DashboardSummary, EloHistoryRow } from "@jits/shared/types/composites";
import { buildEloProgression } from "@jits/shared/utils";
import { formatRecord, recordA11yLabel } from "@/lib/athlete/record";
import { sumEloThisMonth } from "@/lib/profile/elo-this-month";

/** How many recent matches the sparkline draws. */
export const SPARK_MATCHES = 20;

/** "Top 9%" for #37 of 412: rounded UP, so #1 is never "Top 0%". Null without a field. */
export function topPercent(current: number, total: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(total) || current < 1 || total < 1) return null;
  return Math.min(100, Math.max(1, Math.ceil((current / total) * 100)));
}

export interface YourNumbersRank {
  /** "#37" */
  value: string;
  /** "of 412" */
  of: string;
  /** "Top 9%" */
  top: string | null;
  /** "Global rank 37 of 412, top 9 percent" */
  label: string;
}

/**
 * The rank cell, or null for an unranked athlete (no completed match: the
 * RPC still types `rank.current` as a number, so the stats decide).
 */
export function rankCell(summary: Pick<DashboardSummary, "stats" | "rank">): YourNumbersRank | null {
  const totalMatches = summary.stats?.total_matches ?? 0;
  const rank = summary.rank;
  if (totalMatches === 0 || !rank || !(rank.current >= 1) || !(rank.total >= 1)) return null;
  const top = topPercent(rank.current, rank.total);
  return {
    value: `#${rank.current}`,
    of: `of ${rank.total}`,
    top: top === null ? null : `Top ${top}%`,
    label: `Global rank ${rank.current} of ${rank.total}${top === null ? "" : `, top ${top} percent`}`,
  };
}

export interface YourNumbersRecord {
  value: string;
  label: string;
  matches: string;
}

/** A no-break space: the record line never breaks between its tokens. */
const NBSP = " ";

/**
 * "14W · 6L · 1D", spoken in words, and "21 matches" under it. The value
 * joins with no-break spaces, so a large text size never breaks it one token
 * per line.
 */
export function recordCell(stats: DashboardSummary["stats"] | null | undefined): YourNumbersRecord {
  const counts = { wins: stats?.wins ?? 0, losses: stats?.losses ?? 0, draws: stats?.draws ?? 0 };
  const total = counts.wins + counts.losses + counts.draws;
  return {
    value: formatRecord(counts).split(" ").join(NBSP),
    label: recordA11yLabel(counts),
    matches: `${total} ${total === 1 ? "match" : "matches"}`,
  };
}

/** The line under Peak: how far above now, or that now is the peak. */
export function peakNote(peak: number, current: number): string {
  return peak > current ? `${peak - current} above now` : "At your peak";
}

export type MatchOutcome = "win" | "loss" | "draw";

export interface LastMatchDelta {
  delta: number;
  outcome: MatchOutcome;
}

/** The last match's rating change and its outcome (a draw's is amber), or null. */
export function lastMatchDelta(summary: Pick<DashboardSummary, "recent_matches"> | null | undefined): LastMatchDelta | null {
  const last = summary?.recent_matches?.[0];
  const delta = last?.elo_delta;
  if (!last || typeof delta !== "number" || !Number.isFinite(delta)) return null;
  return { delta, outcome: last.outcome };
}

/** A rating delta's tone: amber for a draw (always), else by its sign. */
export function deltaTone(delta: number, outcome?: MatchOutcome | null): "win" | "draw" | "loss" | "flat" {
  if (outcome === "draw") return "draw";
  return delta > 0 ? "win" : delta < 0 ? "loss" : "flat";
}

/** "This month" from the rating history: the profile query's sum (`sumEloThisMonth`). */
export function eloThisMonthFromHistory(
  history: readonly Pick<EloHistoryRow, "created_at" | "delta">[],
  now: Date = new Date(),
): number {
  return sumEloThisMonth(history.map((r) => ({ at: r.created_at, delta: r.delta })), now);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Since Oct 1": the window "This month" covers. */
export function monthStartLabel(now: Date = new Date()): string {
  return `Since ${MONTHS[now.getMonth()]} 1`;
}

/**
 * The sparkline's points, oldest to newest: the rating before the oldest of
 * the last `SPARK_MATCHES` matches, then each rating after, ending on the
 * current rating (appended when the history has not caught up, so the line
 * never contradicts the hero). Fewer than two points draw no line.
 */
export function sparkPoints(history: readonly Pick<EloHistoryRow, "rating_before" | "rating_after" | "created_at">[], current: number): number[] {
  // The RPC returns newest first; buildEloProgression orders them.
  const recent = history.slice(0, SPARK_MATCHES);
  if (recent.length === 0) return [];
  const points = buildEloProgression(recent, current).points;
  return points[points.length - 1] === current ? points : [...points, current];
}

export interface SparkRange {
  lo: number;
  hi: number;
  /** The peak sits within (or near) the drawn range, so its dashed line is drawn. */
  showPeak: boolean;
}

/**
 * The sparkline's value range: the drawn points, plus the peak only when it
 * is within or near them (at most half the points' span, or 10, above). An
 * old high peak would otherwise flatten the line; it is then named in the
 * legend instead of drawn.
 */
export function sparkRange(points: readonly number[], peak: number): SparkRange {
  const lo = Math.min(...points);
  const top = Math.max(...points);
  const near = peak <= top + Math.max(10, (top - lo) / 2);
  return { lo, hi: near ? Math.max(top, peak) : top, showPeak: near };
}

/** The legend's peak note: "Peak 1540, dashed" when drawn, else "Peak 1540". */
export function peakLegend(peak: number, drawn: boolean): string {
  return drawn ? `Peak ${peak}, dashed` : `Peak ${peak}`;
}

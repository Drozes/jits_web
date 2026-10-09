/**
 * Your numbers (jits-1ez5.2): the values the header rating's sheet derives
 * from the dashboard summary, the auth row, the profile query's "this month"
 * and the rating history. Pure, so the sheet stays a view.
 */
import type { DashboardSummary, EloHistoryRow } from "@jits/shared/types/composites";
import { buildEloProgression } from "@jits/shared/utils";
import { formatRecord, recordA11yLabel } from "@/lib/athlete/record";

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

/** "14W · 6L · 1D", spoken in words, and "21 matches" under it. */
export function recordCell(stats: DashboardSummary["stats"] | null | undefined): YourNumbersRecord {
  const counts = { wins: stats?.wins ?? 0, losses: stats?.losses ?? 0, draws: stats?.draws ?? 0 };
  const total = counts.wins + counts.losses + counts.draws;
  return {
    value: formatRecord(counts),
    label: recordA11yLabel(counts),
    matches: `${total} ${total === 1 ? "match" : "matches"}`,
  };
}

/** The line under Peak: how far above now, or that now is the peak. */
export function peakNote(peak: number, current: number): string {
  return peak > current ? `${peak - current} above now` : "At your peak";
}

/** The last match's rating change, or null when there is none. */
export function lastMatchDelta(summary: Pick<DashboardSummary, "recent_matches"> | null | undefined): number | null {
  const delta = summary?.recent_matches?.[0]?.elo_delta;
  return typeof delta === "number" && Number.isFinite(delta) ? delta : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Since Oct 1": the window "This month" covers (the profile query's month). */
export function monthStartLabel(now: Date = new Date()): string {
  return `Since ${MONTHS[now.getMonth()]} 1`;
}

/**
 * The sparkline's points, oldest to newest: the rating before the oldest of
 * the last `SPARK_MATCHES` matches, then each rating after. Fewer than two
 * points draw no line.
 */
export function sparkPoints(history: readonly Pick<EloHistoryRow, "rating_before" | "rating_after" | "created_at">[], current: number): number[] {
  // The RPC returns newest first; buildEloProgression orders them.
  const recent = history.slice(0, SPARK_MATCHES);
  if (recent.length === 0) return [];
  return buildEloProgression(recent, current).points;
}

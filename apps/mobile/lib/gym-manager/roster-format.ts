/**
 * Pure formatters for the gym-owner roster (H6) and athlete detail (H7).
 *
 * Kept free of RN/Expo deps so they stay unit-testable in isolation, matching
 * the format-countdown / session-datetime pattern in this directory.
 */
import { formatRelativeDate } from "@jits/shared/utils";
import type { GymAthleteRecentMatch } from "@jits/shared/types/gym-portal";

/**
 * Most-recent-match timestamp -> "Active 2d ago" for the roster meta-line, or
 * "No matches yet" when the member has never completed a match (null).
 */
export function formatLastActive(lastActive: string | null): string {
  if (!lastActive) return "No matches yet";
  return `Active ${formatRelativeDate(lastActive).toLowerCase()}`;
}

/**
 * Win-rate fraction (0..1) -> "67%", or an em-dash when there are no matches to
 * compute a rate from (mirrors the wireframe's "—" for a 0-match athlete).
 */
export function formatWinRate(winRate: number, totalMatches: number): string {
  if (totalMatches <= 0) return "—";
  return `${Math.round(winRate * 100)}%`;
}

/**
 * Match-history sub-label for the H7 last-5 list: relative date plus the finish
 * type. A draw (a first-class outcome here, Pressure Score) is labeled "Draw";
 * otherwise submission finishes name the technique ("Submission · Armbar") and a
 * null submission is a time-expiry decision.
 */
export function formatFinish(match: GymAthleteRecentMatch): string {
  const when = formatRelativeDate(match.occurred_at);
  if (match.result === "draw") return `${when} · Draw`;
  if (match.submission) return `${when} · Submission · ${match.submission}`;
  return `${when} · Decision (Time)`;
}

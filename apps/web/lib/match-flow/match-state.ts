/**
 * Pure helpers for the web match wizard (`app/(app)/session/[id]/match/...`).
 * Web twin of the relevant parts of `apps/mobile/lib/match-flow/reconcile.ts`
 * and `parse-finish-time.ts`: the DB is the authority when a broadcast is
 * missed, and the result form must never offer a submit the BE will refuse.
 */
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { MatchDetails } from "@jits/shared/api/queries";

/** Poll cadence while a step waits on the other side (mirrors mobile). */
export const MATCH_WAIT_POLL_MS = 4_000;

/**
 * Seconds from the min/sec inputs: undefined when both are empty, NaN when
 * either is malformed or out of range (so validation rejects it).
 */
export function finishSecondsFromFields(mins: string, secs: string): number | undefined {
  if (!mins.trim() && !secs.trim()) return undefined;
  const m = mins.trim() ? Number(mins) : 0;
  const s = secs.trim() ? Number(secs) : 0;
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || s > 59) {
    return Number.NaN;
  }
  return m * 60 + s;
}

/**
 * The BE `record_match_result` requires a finish time for a submission
 * (`missing_fields` when null) within 1..duration (`invalid_finish_time`).
 */
export function isFinishTimeValid(seconds: number | undefined, durationSeconds: number): boolean {
  return (
    seconds !== undefined &&
    Number.isInteger(seconds) &&
    seconds >= 1 &&
    seconds <= durationSeconds
  );
}

export function canSubmitResult(params: {
  result: "submission" | "draw" | null;
  winnerId: string;
  submissionCode: string;
  finishTime: number | undefined;
  durationSeconds: number;
}): boolean {
  if (params.result === "draw") return true;
  return (
    params.result === "submission" &&
    params.winnerId !== "" &&
    params.submissionCode !== "" &&
    isFinishTimeValid(params.finishTime, params.durationSeconds)
  );
}

/** "m:ss" for the finish-time hint. */
export function formatMatchClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Why a match leaves the wizard for its exit, or null when it does not. */
export type MatchExitReason = "cancelled" | "voided";

export function exitReasonFor(status: string | null | undefined): MatchExitReason | null {
  return status === "cancelled" || status === "voided" ? status : null;
}

export const MATCH_EXIT_COPY: Record<MatchExitReason, string> = {
  cancelled: "This match was cancelled.",
  voided: "This result was voided on review. Any rating change was reversed.",
};

/** True once a result is on the row (`record_match_result` has run). */
export function hasRecordedResult(status: string | null | undefined): boolean {
  return status === "completed" || status === "disputed";
}

/**
 * Rebuild the verdict from the DB when the `result_submitted` broadcast was
 * missed, from this athlete's own stamped outcome. Null when none is stamped.
 */
export function resultFromMatch(
  match: Pick<MatchDetails, "participants">,
  currentAthleteId: string,
): BroadcastResult | null {
  const me = match.participants.find((p) => p.athlete_id === currentAthleteId);
  const opponent = match.participants.find((p) => p.athlete_id !== currentAthleteId);
  if (me?.outcome === "draw") return { result: "draw" };
  if (me?.outcome === "win") return { result: "submission", winnerId: currentAthleteId };
  if (me?.outcome === "loss" && opponent) {
    return { result: "submission", winnerId: opponent.athlete_id };
  }
  return null;
}

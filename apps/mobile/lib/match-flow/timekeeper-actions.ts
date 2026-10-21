/**
 * The timekeeper-mode actions the shared live and face-off hooks call
 * (timekeeper mode ARCHITECTURE 2.3, "End" and "Leave"; slice M4): the
 * timekeeper ends the clock (`end_match_clock`) or leaves the seat
 * (`leave_match_as_timekeeper`), and the Leave alerts (TK-E4, TK-K14,
 * TK-K16).
 *
 * Kept out of `use-live-controls.ts` and `use-faceoff-leave.ts` on purpose:
 * those hooks are shared with the two-athlete flow, whose shipped failure
 * toasts show the error's own message, which a timekeeper-mode surface never
 * does (clean-code rule M-R4, `timekeeper-mode-guard.test.ts`). So each call
 * here returns an outcome, never a message: a refusal that means the server
 * has moved on (the clock already ended, the match was cancelled, the seat is
 * gone) asks the caller to re-read, and the DB moves the screen (M-R8).
 */
import { supabase } from "@/lib/supabase/client";
import { endMatchClock, leaveMatchAsTimekeeper, mapTimekeeperError } from "@jits/shared/api/timekeeper";
import type { DomainError, DomainErrorCode } from "@jits/shared/api/errors";
import { TIMEKEEPER_COPY, type AthletePair, type TimekeeperAlert, type TimekeeperToast } from "./timekeeper-copy";

/**
 * `ended`: the clock's end is stamped; send `match_ended` and go on.
 * `moved_on`: the server says the clock is not running for this phone any
 * more (the server auto-end, a no contest, the seat gone): re-read, never
 * retry. `failed`: nothing changed (a network error): the hold is offered
 * again.
 */
export type EndClockOutcome = "ended" | "moved_on" | "failed";

const CLOCK_MOVED_ON: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>([
  "MATCH_NOT_LIVE",
  "NOT_TIMEKEEPER",
  "NOT_PARTICIPANT",
  "NOT_TIMEKEEPER_MODE",
]);

/** The timekeeper ends the clock at `elapsedSeconds` (R15; the server clamps it to the duration). */
export async function endClockAsTimekeeper(matchId: string, elapsedSeconds: number): Promise<EndClockOutcome> {
  try {
    const res = await endMatchClock(supabase, matchId, elapsedSeconds);
    if (res.ok) return "ended";
    return CLOCK_MOVED_ON.has(res.error.code) ? "moved_on" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * The End's moved-on refusals, plus the status refusals of `_tk_pause_match`
 * and `_tk_resume_match` (jr_be `20261021100400`): the match is no longer in
 * progress (`match_not_in_progress`: a no contest or a cancel), or the clock
 * is already in the state asked for (`already_paused`, which the shared
 * table maps to MATCH_NOT_IN_PROGRESS, and `match_not_paused`), which the
 * live step's recovery read has already tried to apply.
 */
const PAUSE_MOVED_ON: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>([
  ...CLOCK_MOVED_ON,
  "MATCH_NOT_IN_PROGRESS",
  "MATCH_NOT_PAUSED",
]);

/**
 * A refused pause or resume of the timekeeper's clock that means the clock
 * is no longer running for this phone (the server's auto-end at full time, a
 * no contest, the seat gone): the live step shows the shipped title alone,
 * which is true, and re-reads, so the DB moves the screen (PM29, UX spec
 * 5.14). Anything else (a network error, no reply within `SEND_CEILING_MS`,
 * an unknown refusal) is a failure the screen cannot explain, which adds
 * `Check your connection and try again.`.
 *
 * The live step calls the shipped `pauseMatch` / `resumeMatch`, whose shared
 * mapping knows none of the timekeeper-mode hints (`match_not_live`,
 * `match_not_in_progress`, `not_timekeeper`): those arrive as UNKNOWN. So
 * this sorts on the server's own refusal (`raw`) through the timekeeper
 * table, and on the mapped code only when there is no server refusal.
 */
export function clockMovedOn(error: DomainError): boolean {
  return PAUSE_MOVED_ON.has(error.raw ? mapTimekeeperError(error.raw).code : error.code);
}

/**
 * `unseated`: a pre-start Leave; the athletes are back on the picker and
 * this phone no longer timekeeps the match (TK-K17). `no_contest`: the clock
 * was running, so the match is a no contest (TK-NC3 through the wizard's
 * exit). `moved_on`: the server refused because the match moved on (the
 * clock ended and the result is owed, the seat or the match is gone): re-read.
 * `failed`: nothing changed.
 */
export type LeaveSeatOutcome = "unseated" | "no_contest" | "moved_on" | "failed";

const SEAT_MOVED_ON: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>([
  "RESULT_OWED",
  "NOT_TIMEKEEPER",
  "NOT_PARTICIPANT",
  "NOT_TIMEKEEPER_MODE",
  // `invalid_status`: the match is no longer pending or live.
  "MATCH_NOT_PENDING",
]);

/** The seated timekeeper leaves (R21, A4, A5). */
export async function leaveSeat(matchId: string): Promise<LeaveSeatOutcome> {
  try {
    const res = await leaveMatchAsTimekeeper(supabase, matchId);
    if (res.ok) return res.data.status === "cancelled" ? "no_contest" : "unseated";
    return SEAT_MOVED_ON.has(res.error.code) ? "moved_on" : "failed";
  } catch {
    return "failed";
  }
}

/** The timekeeper's Leave alert before the start (TK-K14): the athletes, challenger first, pick again. */
export function prestartLeaveAlert(athletes: AthletePair): TimekeeperAlert {
  return TIMEKEEPER_COPY["TK-K14"](athletes);
}

/** The timekeeper's Leave alert while the clock runs (TK-K16): leaving makes it a no contest. */
export const LIVE_LEAVE_ALERT: TimekeeperAlert = TIMEKEEPER_COPY["TK-K16"];

/** An athlete's Leave alert once a timekeeper is seated (TK-E4; while picking, the shipped alert stays). */
export function athleteLeaveAlert(opponent: string): TimekeeperAlert {
  return TIMEKEEPER_COPY["TK-E4"](opponent);
}

/** The toast of a timekeeper who left the seat before the start (TK-K17, one line). */
export const UNSEATED_TOAST: TimekeeperToast = { title: TIMEKEEPER_COPY["TK-K17"], description: "" };

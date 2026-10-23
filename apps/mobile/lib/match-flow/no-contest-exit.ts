/**
 * The reason-specific exit of a timekeeper-mode match (spec 6.2, 4.3): which
 * toast the wizard shows when a timekeeper-mode match leaves it without a
 * result. `use-wizard-sync.ts` calls `noContestExit` from its one exit path
 * (a cancelled snapshot, or the timekeeper losing the seat), which leaves
 * through `exitMatchTo`, and falls back to the shipped "Match cancelled"
 * toast when it returns null. A two-athlete match never reaches it.
 *
 * Per reason and viewer (spec 6.2; copy deck Rounds 4 and 5):
 *
 *   reason               athlete            timekeeper
 *   no_timekeeper        TK-W2              (never seated then: shipped)
 *   athlete_left         TK-E1 {athlete}    TK-E1 {athlete}
 *   timekeeper_left      TK-NC1 {name}      TK-NC3 {A} {B}
 *   timekeeper_offline   TK-NC2 {name}      TK-NC6 {A} {B}
 *   admin_void           TK-NC4 {A} {B}     TK-NC4 {A} {B}
 *   faceoff_timeout      TK-NC5             TK-NC5
 *   pause_timeout        TK-NC7             TK-NC7
 *   no longer seated     (never)            TK-K17
 *
 * Names are short names (`M. Reyes`): `{A}` and `{B}` the athletes,
 * challenger first, `{name}` the timekeeper, TK-E1's `{athlete}` the athlete
 * who left. A toast whose name is not known (a read without the timekeeper's
 * identity, or TK-E1 on the timekeeper's phone when no broadcast named the
 * athlete) falls back to the shipped toast rather than print an empty name.
 * Pure.
 */
import type { MatchCancelReason } from "@jits/shared/api/queries";
import type { MatchRoles } from "./match-roles";
import { TIMEKEEPER_COPY as C, type AthletePair, type TimekeeperToast } from "./timekeeper-copy";

/** The match's `cancel_reason`, or the viewer is no longer its timekeeper (TK-K17). */
export type NoContestExitReason = MatchCancelReason | "no_longer_timekeeper";

export interface NoContestExitInput {
  /** Null when the cancel carries no reason. */
  reason: NoContestExitReason | null;
  /** Who is viewing (athlete or timekeeper), the athletes (challenger first) and the timekeeper. */
  roles: Pick<MatchRoles, "viewer" | "me" | "athletes" | "timekeeper">;
  /**
   * The athlete whose action it was, when a `match_cancelled` broadcast named
   * them (`actor_id`, recorded through the sync context's `noteCancelActor`);
   * else null. Not validated: resolve it against `roles.athletes`, and treat
   * an id that matches neither athlete as no name. On the timekeeper's phone
   * an `athlete_left` exit waits briefly for it (`use-wizard-sync.ts`,
   * `CANCEL_ACTOR_GRACE_MS`), so null there means the broadcast never came.
   * An athlete's exit never waits: the athlete who left is the opponent.
   */
  actorId?: string | null;
}

/** The deck toast for this exit, or null for the shipped "Match cancelled" toast. */
export function noContestExit({ reason, roles, actorId = null }: NoContestExitInput): TimekeeperToast | null {
  const asTimekeeper = roles.viewer === "timekeeper";
  const pair: AthletePair = { a: roles.athletes[0].shortName, b: roles.athletes[1].shortName };
  const name = roles.timekeeper?.shortName ?? "";
  switch (reason) {
    case "no_timekeeper":
      return asTimekeeper ? null : C["TK-W2"];
    case "athlete_left": {
      const athlete = leaverName(roles, actorId);
      return athlete ? C["TK-E1"](athlete) : null;
    }
    case "timekeeper_left":
      if (asTimekeeper) return C["TK-NC3"](pair);
      return name ? C["TK-NC1"](name) : null;
    case "timekeeper_offline":
      if (asTimekeeper) return C["TK-NC6"](pair);
      return name ? C["TK-NC2"](name) : null;
    case "admin_void":
      return C["TK-NC4"](pair);
    case "faceoff_timeout":
      return C["TK-NC5"];
    case "pause_timeout":
      return C["TK-NC7"];
    case "no_longer_timekeeper":
      // TK-K17 is one line: the toast's title, with no description.
      return asTimekeeper ? { title: C["TK-K17"], description: "" } : null;
    default:
      return null;
  }
}

/**
 * The athlete who left (TK-E1): the one a broadcast named, else, on an
 * athlete's phone, the opponent (the only other athlete). The timekeeper
 * without a named athlete gets no name.
 */
function leaverName(roles: NoContestExitInput["roles"], actorId: string | null): string | null {
  const named = actorId ? roles.athletes.find((a) => a.athleteId === actorId) : undefined;
  if (named) return named.shortName || null;
  const me = roles.me;
  if (!me) return null;
  const other = roles.athletes.find((a) => a.athleteId !== me.athleteId);
  return other?.shortName || null;
}

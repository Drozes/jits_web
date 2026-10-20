/**
 * The reason-specific exit of a timekeeper-mode match (spec 6.2, 4.3): which
 * toast the wizard shows when a timekeeper-mode match leaves it without a
 * result. `use-wizard-sync.ts` calls `noContestExit` from its one exit path
 * (a cancelled snapshot, or the timekeeper losing the seat) and falls back to
 * the shipped "Match cancelled" toast when it returns null.
 *
 * Final signature, body owned by slice M4 (jits-o47s.6; PLAN 3.2 collision
 * rules): it returns the deck toast per reason and viewer, TK-W2,
 * TK-NC1 to TK-NC7, TK-E1 and TK-K17 (`timekeeper-copy.ts`). Until M4 lands
 * it returns null, so every timekeeper-mode exit shows the shipped toast.
 * A two-athlete match never reaches it.
 */
import type { MatchCancelReason } from "@jits/shared/api/queries";
import type { MatchRoles } from "./match-roles";
import type { TimekeeperToast } from "./timekeeper-copy";

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
export function noContestExit(_input: NoContestExitInput): TimekeeperToast | null {
  return null;
}

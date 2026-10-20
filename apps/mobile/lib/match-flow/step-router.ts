/**
 * The match wizard's steps, and the pure mapping from a match's persisted DB
 * state to the step the wizard mounts on (timekeeper mode spec 6.2).
 *
 * Steps, in order. The order is also time order: the wizard's own setter
 * never moves to an earlier step (`use-wizard-sync.ts`), and the reconciler
 * moves back only where `step-transitions.ts` allows it: the initial
 * correction both modes have (on the first snapshot it moves an athlete who
 * has not confirmed from `summary` back to `confirm`, jits-bmei,
 * `planReconcile` in `reconcile.ts`), and the two timekeeper-mode moves.
 *   - `crew`    : timekeeper mode only, athletes only: pick a timekeeper
 *                 (pending, nobody seated). Never reached by a two-athlete match.
 *   - `weight`  : the face-off weigh-in. Each athlete confirms their own
 *                 weight, and checks the opponent's where weight checks are on.
 *                 The timekeeper's one combined face-off screen.
 *   - `ready`   : the face-off ready check. Two-athlete: each athlete taps
 *                 Ready; once both are ready each device calls `start_match`
 *                 (the loser of that race reads the started match) and both
 *                 move to `live`. Timekeeper mode: ready is server state and
 *                 the timekeeper starts.
 *   - `live`    : the countdown, then the clock: pause / resume, hold to end.
 *   - `end`     : transient, the moment after the end; advances to `result`.
 *   - `result`  : record a submission (winner, finish, time) or a draw.
 *   - `confirm` : an athlete confirms or disputes the recorded result.
 *   - `summary` : the verdict and rating change, then the exit; the
 *                 timekeeper's done screen.
 *
 * The practice match draws its header from its own list (`PRACTICE_STEPS` in
 * `lib/practice/constants.ts`), so a change here never moves that header.
 */
import type { MatchMode, ViewerRole } from "./match-roles";

export type MatchStep =
  | "crew"
  | "weight"
  | "ready"
  | "live"
  | "end"
  | "result"
  | "confirm"
  | "summary";

export const MATCH_STEPS: readonly MatchStep[] = [
  "crew",
  "weight",
  "ready",
  "live",
  "end",
  "result",
  "confirm",
  "summary",
] as const;

/** The match fields the routing reads; the timekeeper-mode ones are absent on a two-athlete match. */
export interface MatchLike {
  status: string;
  /** The seated timekeeper (timekeeper mode). */
  timekeeper_id?: string | null;
  /** The timekeeper ended the clock (timekeeper mode; status stays `in_progress`). */
  ended_at?: string | null;
}

/** The part of `MatchRoles` the routing reads. */
export interface RouteRoles {
  mode: MatchMode;
  viewer: ViewerRole;
  me: { athleteId: string } | null;
}

/** The part of the timekeeper-mode state (`get_timekeeper_match_state`) the routing reads. */
export interface RouteTimekeeperState {
  ready: readonly { athleteId: string }[];
}

/**
 * Returns the step the wizard should mount on. Without roles, or for a
 * two-athlete match, the shipped status mapping (`selfRunStep`), unchanged.
 * Pure / side-effect free so it can be reused in tests.
 */
export function getCurrentStep(
  match: MatchLike,
  roles?: RouteRoles | null,
  tkState?: RouteTimekeeperState | null,
): MatchStep {
  if (roles?.mode === "timekeeper") return timekeeperStep(match, roles, tkState ?? null);
  return selfRunStep(match);
}

/** The two-athlete flow: the step from the status alone. */
function selfRunStep(match: MatchLike): MatchStep {
  switch (match.status) {
    case "pending":
      return "weight";
    case "in_progress":
      return "live";
    case "completed":
      return "summary";
    case "disputed":
      // Disputed matches surface in the summary state so users can see
      // what happened and exit; the wizard does not let them re-record.
      return "summary";
    case "voided":
      // An admin voided a disputed result (resolve_dispute). Terminal: mount
      // on the summary, whose only action is the exit, never on the weight
      // step, whose confirm would walk a finished match into a ready check.
      // The reconciler's first snapshot then exits with a "Match voided"
      // toast (planReconcile exits voided even from the summary).
      return "summary";
    default:
      // Includes `cancelled`: the reconciler's first snapshot exits it.
      return "weight";
  }
}

/**
 * Timekeeper mode (spec 6.2). Athletes pick on `crew` until someone is
 * seated, then the face-off (`ready` once the server has them ready); the
 * timekeeper has one combined face-off screen. Once the clock has ended
 * everyone is on `result` (the athletes' waiting view, the timekeeper's
 * form), and a completed match mounts on `summary` like the two-athlete flow
 * (the reconciler's initial correction moves an athlete who still owes a
 * confirmation to `confirm`; the timekeeper's `summary` is the done screen).
 */
function timekeeperStep(match: MatchLike, roles: RouteRoles, tkState: RouteTimekeeperState | null): MatchStep {
  const athlete = roles.viewer !== "timekeeper";
  switch (match.status) {
    case "pending": {
      if (!match.timekeeper_id) return athlete ? "crew" : "weight";
      const me = roles.me?.athleteId;
      return athlete && me && tkState?.ready.some((r) => r.athleteId === me) ? "ready" : "weight";
    }
    case "in_progress":
      return match.ended_at ? "result" : "live";
    case "completed":
    case "disputed":
    case "voided":
      return "summary";
    default:
      // Includes `cancelled`: the reconciler's first snapshot exits it with
      // its reason. A step with no face-off channel, so nothing is sent.
      return athlete ? "crew" : "weight";
  }
}

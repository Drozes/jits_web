/**
 * The match wizard's steps, and the pure mapping from a match's persisted DB
 * status to the step the wizard mounts on. Mirrors the web's
 * `computeInitialStep` without its timekeeper variants: the mobile wizard has
 * no timekeeper (web's session timekeeper never came to mobile).
 *
 * Steps, in order. The order is also time order: the wizard's own setter
 * never moves to an earlier step (`use-wizard-sync.ts`), and the reconciler
 * moves back only once, for its initial correction: on the first snapshot it
 * moves an athlete who has not confirmed from `summary` back to `confirm`
 * (jits-bmei, `planReconcile` in `reconcile.ts`).
 *   - `weight`  : the face-off weigh-in. Each athlete confirms their own
 *                 weight, and checks the opponent's where weight checks are on.
 *   - `ready`   : the face-off ready check. Each athlete taps Ready; once both
 *                 are ready each device calls `start_match` (the loser of that
 *                 race reads the started match) and both move to `live`.
 *   - `live`    : the countdown, then the clock: pause / resume, hold to end.
 *   - `end`     : transient, the moment after the end; advances to `result`.
 *   - `result`  : record a submission (winner, finish, time) or a draw.
 *   - `confirm` : the other athlete confirms or disputes the recorded result.
 *   - `summary` : the verdict and rating change, then the exit.
 *
 * The practice match draws its header from its own list (`PRACTICE_STEPS` in
 * `lib/practice/constants.ts`), so a change here never moves that header.
 */
export type MatchStep =
  | "weight"
  | "ready"
  | "live"
  | "end"
  | "result"
  | "confirm"
  | "summary";

export const MATCH_STEPS: readonly MatchStep[] = [
  "weight",
  "ready",
  "live",
  "end",
  "result",
  "confirm",
  "summary",
] as const;

export interface MatchLike {
  status: string;
}

/**
 * Returns the step the wizard should mount in based on persisted match
 * status. Pure / side-effect free so it can be reused in tests.
 */
export function getCurrentStep(match: MatchLike): MatchStep {
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

/**
 * The wizard's only backward steps beyond the initial correction (timekeeper
 * mode spec 6.2, A5, A8; ARCHITECTURE 2.2). Step order is time order
 * (`MATCH_STEPS`), and the wizard never moves to an earlier step except:
 *  - the initial correction both modes have (jits-bmei): on the first
 *    snapshot only, an athlete who has not confirmed goes from `summary` back
 *    to `confirm`. It lives in `planReconcile` (`reconcile.ts`), keyed on its
 *    `initial` flag, and is NOT part of this rule;
 *  - and, in timekeeper mode, for an athlete, the two moves below, each one
 *    proven by the snapshot in hand:
 *     1. `weight` or `ready` back to `crew` when the match is pending with no
 *        seated timekeeper: a pre-start drop-out returned the athletes to the
 *        picker (A5);
 *     2. `summary` back to `confirm` when the result was edited after the
 *        verdict was reached (`result_edit_count` is above
 *        `summaryEditCount`, the count the wizard entered `summary` on) and
 *        this athlete's confirmation is gone (A8: an edit resets both
 *        confirmations). The baseline is fixed for as long as the wizard
 *        stays on `summary`, not moved by every snapshot, so a read that
 *        cannot prove the reset (confirmations unknown, or read before the
 *        edit committed) never uses the edit up: the next consistent read
 *        still moves back.
 * Nothing else ever moves back, and nothing in the two-athlete flow moves back
 * through this rule. Pure, so the match-loop harness can import it.
 */
import type { MatchStep } from "./step-router";
import type { MatchSnapshot, ReconcileRoles } from "./reconcile";

export function isAllowedBackward(
  from: MatchStep,
  to: MatchStep,
  snapshot: MatchSnapshot,
  roles: ReconcileRoles,
): boolean {
  if (roles.mode !== "timekeeper" || roles.viewer === "timekeeper" || !roles.me) return false;
  if ((from === "weight" || from === "ready") && to === "crew") {
    return snapshot.status === "pending" && !snapshot.timekeeperId;
  }
  if (from === "summary" && to === "confirm") {
    const ids = snapshot.confirmedAthleteIds;
    const baseline = snapshot.summaryEditCount;
    if (baseline == null || snapshot.status !== "completed" || ids == null) return false;
    return (snapshot.resultEditCount ?? 0) > baseline && !ids.includes(roles.me.athleteId);
  }
  return false;
}

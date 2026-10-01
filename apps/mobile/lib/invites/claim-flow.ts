/**
 * The claim runner's decisions (jr_be spec 016, plan 10 and contract 7), pure
 * so every branch is tested without a device. `use-claim-runner.ts` performs
 * the calls; this file decides what each answer means.
 */
import type { AcceptJoinResult, ClaimResult } from "@jits/shared/api/invites";
import { bookedMessage, claimFailureView, inviterNameForCopy, joinFailureMessage } from "@jits/shared/utils";

export type ClaimStep =
  | { type: "go_match"; matchId: string }
  | { type: "booked"; challengeId: string; message: string; inviterName: string; locationOff: boolean }
  | { type: "setup" }
  | { type: "retry_location"; message: string }
  | { type: "message"; message: string; terminal: boolean; retryAfterS?: number | null }
  | { type: "try_join" }
  | { type: "friends"; inviterName: string; already: boolean };

/**
 * What to do with a `claim_challenge_invite` answer.
 *
 * - started (or an idempotent retry with a match): straight to the face-off.
 * - booked / already_claimed without a match: the booking state.
 * - `invalid` on a token: it may be a join link, so try accept_join_invite.
 * - `claimer_not_active`: setup, but only for a pending profile (an inactive
 *   account would loop between setup and claim).
 */
export function stepForClaim(
  result: ClaimResult,
  ctx: { viaCode: boolean; athleteStatus: string | null | undefined; locationOff: boolean; joinTried?: boolean },
): ClaimStep {
  if (result.ok) {
    if (result.match_id) return { type: "go_match", matchId: result.match_id };
    const name = inviterNameForCopy(result.inviter);
    return {
      type: "booked",
      challengeId: result.challenge_id,
      message: bookedMessage(result.start_blocked_reason, name),
      inviterName: name,
      locationOff: ctx.locationOff,
    };
  }
  if (result.code === "invalid" && !ctx.viaCode && !ctx.joinTried) return { type: "try_join" };
  if (result.code === "claimer_not_active" && (!ctx.athleteStatus || ctx.athleteStatus === "pending")) {
    return { type: "setup" };
  }
  if (result.code === "claimer_not_active") {
    return { type: "message", message: "Your account can't take matches right now.", terminal: true };
  }
  const view = claimFailureView(result.code, {
    inviterName: inviterNameForCopy(result.inviter),
    viaCode: ctx.viaCode,
    attemptsLeft: result.attempts_left,
    retryAfterS: result.retry_after_s,
  });
  if (view.next === "retry_location") return { type: "retry_location", message: view.message };
  // A wrong code (tries left) or a throttle is not terminal: the athlete fixes
  // the code. Everything else ends the invite on this device.
  const terminal = !(ctx.viaCode && (result.code === "invalid" || result.code === "throttled"));
  if (result.code === "throttled") {
    return { type: "message", message: view.message, terminal, retryAfterS: result.retry_after_s };
  }
  return { type: "message", message: view.message, terminal };
}

/**
 * What to do with an `accept_join_invite` answer. `newAccount`: the account
 * was created after the link was captured, so invite setup's attribution
 * already made the friendship and `already_friends` reads as "now friends".
 */
export function stepForJoin(
  result: AcceptJoinResult,
  athleteStatus: string | null | undefined,
  opts: { newAccount?: boolean } = {},
): ClaimStep {
  if (result.ok) {
    return {
      type: "friends",
      inviterName: inviterNameForCopy(result.inviter),
      already: result.result === "already_friends" && !opts.newAccount,
    };
  }
  if (result.code === "claimer_not_active" && (!athleteStatus || athleteStatus === "pending")) return { type: "setup" };
  return { type: "message", message: joinFailureMessage(result.code, "your training partner"), terminal: true };
}

/** Steps after which the pending invite is cleared from the device. */
export function clearsPendingInvite(step: ClaimStep): boolean {
  switch (step.type) {
    case "go_match":
    case "booked":
    case "friends":
      return true;
    case "message":
      return step.terminal;
    default:
      return false;
  }
}

/**
 * The account was created after the invite was captured on this device (it
 * came through signup), so it is the intended account and invite setup has
 * already attributed it.
 */
export function isNewAccountForInvite(userCreatedAt: string | null | undefined, firstTouchAt: string): boolean {
  const created = Date.parse(userCreatedAt ?? "");
  const touched = Date.parse(firstTouchAt);
  return Number.isFinite(created) && Number.isFinite(touched) && created >= touched;
}

/**
 * Client copy for every invite outcome (jr_be spec 016, contract section 7).
 * Pure: the screens map a result code to one of these and render it, so the
 * exact copy is tested once here instead of in each screen.
 */

/** Failure codes returned by `claim_challenge_invite` as `{ok:false, code}`. */
export type ClaimFailureCode =
  | "invalid"
  | "throttled"
  | "self"
  | "used"
  | "revoked"
  | "expired"
  | "inviter_unavailable"
  | "claimer_not_active"
  | "dob_required"
  | "underage"
  | "inviter_weekly_cap"
  | "accuracy_too_low";

export type StartBlockedReason =
  | "no_location"
  | "waiting"
  | "far"
  | "stale"
  | "inviter_busy"
  | "claimer_busy";

/** Hints raised by create_invite / refresh_invite_code / get_or_create_personal_invite. */
export type CreateInviteErrorCode =
  | "invites_disabled"
  | "not_active"
  | "too_many_open_invites"
  | "daily_invite_limit"
  | "weekly_invite_match_cap"
  | "invite_not_open"
  | "not_found"
  | "unknown";

/** What a claim result screen shows. `next` tells the screen what to do. */
export interface ClaimOutcomeView {
  /** `dob`: ask for the date of birth, save it, then retry the same claim. */
  next: "message" | "setup" | "retry_location" | "dob";
  message: string;
  /** Shown as a secondary action label when the outcome is recoverable. */
  actionLabel?: string;
  /**
   * True for a code this client does not know (a newer server): the copy is
   * generic and the athlete may try again. Never shown as `underage`.
   */
  retryable?: boolean;
}

export const UNDERAGE_COPY = "You must be 16 or older to compete on ELO RATED.";

/** `dob_required` (contract section 7): an older account has no date of birth. */
export const DOB_REQUIRED_TITLE = "Confirm your date of birth";
export const DOB_REQUIRED_COPY =
  "We need your date of birth before your first match. You must be 16 or older.";
export const DOB_SAVE_FAILED_COPY = "Couldn't save your date of birth. Check your connection and try again.";
export const DOB_INVALID_COPY = "Enter a real date of birth.";

/** A claim code this client does not know: generic, retryable, never underage. */
export const CLAIM_UNKNOWN_COPY = "Something went wrong opening this invite. Try again.";

export type DateOfBirthCheck = "ok" | "invalid" | "underage";

/**
 * Client check of a `YYYY-MM-DD` date of birth before it is saved: a real
 * calendar date, not in the future, not before 1900, and 16 or older on
 * `today` (local calendar). The claim RPC re-checks age on the server date.
 */
export function checkDateOfBirth(value: string, today: Date = new Date()): DateOfBirthCheck {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return "invalid";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "invalid";
  if (y < 1900) return "invalid";
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  if (y > ty || (y === ty && (mo > tm || (mo === tm && d > td)))) return "invalid";
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  return age >= 16 ? "ok" : "underage";
}

/** First name for copy: `ALEX` style comes from the server card; falls back. */
export function inviterNameForCopy(
  inviter: { first_name?: string | null; display_name?: string | null } | null | undefined,
): string {
  return inviter?.first_name?.trim() || inviter?.display_name?.trim() || "Your training partner";
}

/** Whole minutes (at least 1) for a throttle countdown. */
export function minutesFromSeconds(seconds: number | null | undefined): number {
  const s = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : 0;
  return Math.max(1, Math.ceil(s / 60));
}

/**
 * The copy for a failed claim. `viaCode` picks the code-entry variant of
 * `invalid` (tries left) over the link variant.
 */
export function claimFailureView(
  code: ClaimFailureCode | string,
  opts: {
    inviterName?: string;
    viaCode?: boolean;
    attemptsLeft?: number | null;
    retryAfterS?: number | null;
  } = {},
): ClaimOutcomeView {
  const alex = opts.inviterName ?? "Your training partner";
  switch (code) {
    case "expired":
      return { next: "message", message: `This challenge expired. Ask ${alex} for a new one.` };
    case "used":
      return { next: "message", message: "Someone already accepted this challenge." };
    case "revoked":
      return { next: "message", message: `${alex} withdrew this challenge.` };
    case "self":
      return { next: "message", message: "This is your own challenge. Send it to a training partner." };
    case "invalid":
      if (opts.viaCode) {
        const n = typeof opts.attemptsLeft === "number" ? opts.attemptsLeft : 0;
        return { next: "message", message: `That code didn't match. ${n} ${n === 1 ? "try" : "tries"} left.` };
      }
      return {
        next: "message",
        message: "This invite link isn't valid. Ask your training partner to send it again.",
      };
    case "throttled":
      return {
        next: "message",
        message: `Too many tries. Try again in ${minutesFromSeconds(opts.retryAfterS)} ${
          minutesFromSeconds(opts.retryAfterS) === 1 ? "minute" : "minutes"
        }.`,
      };
    case "underage":
      return { next: "message", message: UNDERAGE_COPY };
    case "dob_required":
      return { next: "dob", message: DOB_REQUIRED_COPY };
    case "claimer_not_active":
      return { next: "setup", message: "Finish your profile to accept." };
    case "inviter_unavailable":
      return { next: "message", message: `${alex} can't take matches right now.` };
    case "inviter_weekly_cap":
      return {
        next: "message",
        message: `${alex} has played this week's invite matches. You're now friends, so challenge them from the Arena.`,
      };
    case "accuracy_too_low":
      return {
        next: "retry_location",
        message: ACCURACY_TOO_LOW_COPY,
        actionLabel: "Try again",
      };
    default:
      return { next: "message", message: CLAIM_UNKNOWN_COPY, retryable: true };
  }
}

export const ACCURACY_TOO_LOW_COPY =
  "We couldn't pin your location. Move near a window or turn on Wi-Fi, then try again.";

export const LOCATION_DENIED_COPY =
  "Location is off. ELO RATED checks you're both on the same mat before a match starts.";

export const BOOKED_COPY = "You're booked. The match starts when you're both on the mat.";

export const BOOKING_CLOSED_COPY = "This booking was cancelled.";

/** The booked-state line for a start-blocked reason. */
export function bookedMessage(reason: StartBlockedReason | null | undefined, inviterName: string): string {
  if (reason === "inviter_busy") return `${inviterName} is mid-match. We'll hold your spot.`;
  if (reason === "claimer_busy") {
    return `Finish your current match first. Your booking with ${inviterName} is saved.`;
  }
  return BOOKED_COPY;
}

/** Copy for an inviter-side create / refresh failure. */
export function createInviteErrorMessage(code: CreateInviteErrorCode | string): string {
  switch (code) {
    case "invites_disabled":
      return "Invites are paused right now.";
    case "too_many_open_invites":
      return "You have 5 open challenges. Revoke one to send another.";
    case "daily_invite_limit":
      return "You've sent today's 20 invites. Try again tomorrow.";
    case "weekly_invite_match_cap":
      return "You've played this week's 3 invite matches. Challenge friends from the Arena.";
    case "not_active":
      return "Finish your profile before inviting a training partner.";
    case "invite_not_open":
      return "This challenge is closed. Start a new one.";
    default:
      return "Couldn't create the invite. Check your connection and try again.";
  }
}

/** Copy for a failed `accept_join_invite`. */
export function joinFailureMessage(code: string, inviterName: string): string {
  switch (code) {
    case "self":
      return "This is your own invite link.";
    case "revoked":
      return `This invite link was turned off. Ask ${inviterName} for a new one.`;
    case "claimer_not_active":
      return "Finish your profile to add friends.";
    case "invalid":
      return "This invite link isn't valid. Ask your training partner to send it again.";
    default:
      // A code this build does not know (a newer server).
      return CLAIM_UNKNOWN_COPY;
  }
}

/** Join failure codes this build knows; anything else is retryable. */
export function isKnownJoinFailure(code: string): boolean {
  return code === "invalid" || code === "self" || code === "revoked" || code === "claimer_not_active";
}

/** Signup banner for a signed-out invitee. */
export function inviteSignupBanner(kind: "join" | "challenge" | null, inviterName: string | null): string {
  const alex = inviterName || "Your training partner";
  return kind === "join"
    ? `${alex} invited you. Create your account to join.`
    : `${alex} challenged you. Create your account to accept.`;
}

/** Banner on the one-screen invite setup (the account already exists). */
export function inviteSetupBanner(kind: "join" | "challenge" | null): string {
  if (kind === "challenge") return "Finish your profile to accept the challenge.";
  if (kind === "join") return "Finish your profile to join your training partner.";
  return "Finish your profile and we'll open your invite.";
}

export const LOCATION_UNAVAILABLE_COPY = "We couldn't get your location. Check your signal, then try again.";

/** Copy for a failed `revoke_invite`. */
export function revokeInviteErrorMessage(hint: string): string {
  switch (hint) {
    case "invite_already_claimed":
      return "Your training partner already accepted this challenge.";
    case "invite_not_open":
    case "invite_expired":
      return "This challenge already closed.";
    default:
      return "Couldn't withdraw the challenge. Check your connection and try again.";
  }
}

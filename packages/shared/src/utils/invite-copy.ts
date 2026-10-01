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
  | "claimer_busy"
  /** `match_location_required` off: either athlete can tap Start match. */
  | "start_available"
  /** The booking was cancelled (flag-on proximity path). */
  | "booking_closed";

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
 * `today`. "Today" is the UTC calendar date, because the claim RPC re-checks
 * age against Postgres `current_date` (UTC), and the two must agree on the
 * 16th birthday or the client could pass a date the server calls underage.
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
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();
  if (y > ty || (y === ty && (mo > tm || (mo === tm && d > td)))) return "invalid";
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  return age >= 16 ? "ok" : "underage";
}

/** Today's UTC calendar date as `YYYY-MM-DD` (the server's `current_date`). */
export function utcTodayYmd(today: Date = new Date()): string {
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  const d = String(today.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

/** Booked with `match_location_required` off: the Start match button starts it. */
export const START_AVAILABLE_COPY = "You're booked. Tap Start match when you're both on the mat.";

export const BOOKING_CLOSED_COPY = "This booking was cancelled.";

/** The booked-state line for a start-blocked reason. */
export function bookedMessage(reason: StartBlockedReason | null | undefined, inviterName: string): string {
  if (reason === "inviter_busy") return `${inviterName} is mid-match. We'll hold your spot.`;
  if (reason === "claimer_busy") {
    return `Finish your current match first. Your booking with ${inviterName} is saved.`;
  }
  if (reason === "start_available") return START_AVAILABLE_COPY;
  if (reason === "booking_closed") return BOOKING_CLOSED_COPY;
  return BOOKED_COPY;
}

// ---------------------------------------------------------------------------
// Booked strip (Arena): short copies
// ---------------------------------------------------------------------------
//
// The Arena's Booked strip has room for about 46 characters (two 11px lines
// beside two outline buttons at 375pt). It shows these short lines and keeps
// the full copy above as the status line's accessibilityLabel, so VoiceOver
// still hears the whole instruction. Precedence on the strip: a location fix
// (ask / denied, unavailable, accuracy too low) always wins over the busy
// line, because nothing can start until the location is fixed.

/** Longest strip status the Booked strip fits without truncating. */
export const BOOKED_STRIP_MAX_CHARS = 46;

/** Strip form of LOCATION_DENIED_COPY (never asked, or denied). */
export const LOCATION_DENIED_STRIP_COPY = "Location off. Needed to start.";

/** Strip form of LOCATION_UNAVAILABLE_COPY. */
export const LOCATION_UNAVAILABLE_STRIP_COPY = "No location signal. Try again.";

/** Strip form of ACCURACY_TOO_LOW_COPY. */
export const ACCURACY_TOO_LOW_STRIP_COPY = "Can't pin your location. Try near a window.";

/** Strip form of BOOKED_COPY. */
export const BOOKED_STRIP_COPY = "Starts when you're both on the mat.";

/** Strip form of START_AVAILABLE_COPY. */
export const START_AVAILABLE_STRIP_COPY = "Tap Start when you're both on the mat.";

/** Strip form of the claimer_busy line. */
export const CLAIMER_BUSY_STRIP_COPY = "Finish your match first.";

/**
 * The Booked strip's short busy line for a start-blocked reason; the full
 * `bookedMessage` is its accessibilityLabel.
 */
export function bookedStripMessage(reason: StartBlockedReason | null | undefined, inviterName: string): string {
  if (reason === "inviter_busy") return `${inviterName} is mid-match. We'll hold your spot.`;
  if (reason === "claimer_busy") return CLAIMER_BUSY_STRIP_COPY;
  if (reason === "start_available") return START_AVAILABLE_STRIP_COPY;
  if (reason === "booking_closed") return BOOKING_CLOSED_COPY;
  return BOOKED_STRIP_COPY;
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

// ---------------------------------------------------------------------------
// match_location_required (016 addendum)
// ---------------------------------------------------------------------------

/** Shown before the location permission prompt on Go Live (flag on). */
export const GO_LIVE_LOCATION_EXPLAIN_COPY =
  "ELO RATED checks you're on the same mat as your opponent. Your location is only used to start matches.";

/** Go Live with a reading too coarse to use (flag on). */
export const GO_LIVE_ACCURACY_COPY = "Can't pin your location. Try near a window.";

/** Go Live with location off (denied, or the server's `location_required`). */
export const GO_LIVE_LOCATION_DENIED_COPY =
  "Location is off. ELO RATED checks you're on the same mat as your opponent before a match starts. Turn it on in Settings to go live.";

/** An Arena start refused with `proximity_required` / `proximity_failed`. */
export function arenaProximityMessage(opponentName: string | null | undefined): string {
  const name = opponentName?.trim() || "your opponent";
  return `You need to be on the same mat as ${name} to start.`;
}

/**
 * A reading the server refused as `implausible_movement` (the implied speed
 * from the previous reading is over 50 m/s). Shown once; the client never
 * retries it on its own (the next reading comes from the usual cadence or
 * from the athlete's own Retry).
 */
export const IMPLAUSIBLE_MOVEMENT_COPY = "Can't pin your location. Try again.";

/** Shown when the server has no fresh reading from this athlete for the start. */
export const ARENA_SELF_LOCATION_MISSING_COPY = "Can't confirm your location. Try again.";

/** Who an Arena challenge belongs to, from the caller's side. */
export type ArenaChallengeRole = "challenger" | "opponent";

/**
 * An Arena start refused by the proximity gate, worded by whose reading is
 * missing. `proximity_required` carries `challenger` | `opponent` | `both`
 * in the exception DETAIL: the side named has no fresh reading. My side
 * missing reads "Can't confirm your location. Try again.", the other side
 * "Waiting for ALEX's location.", and `both`, a missing DETAIL or a
 * `proximity_failed` (both read, too far apart) the same-mat copy.
 */
export function arenaProximityCopy(input: {
  hint: "proximity_required" | "proximity_failed";
  detail: string | null | undefined;
  selfRole: ArenaChallengeRole;
  opponentName: string | null | undefined;
}): string {
  if (input.hint === "proximity_required") {
    const missing = input.detail?.trim();
    if (missing === input.selfRole) return ARENA_SELF_LOCATION_MISSING_COPY;
    if (missing === "challenger" || missing === "opponent") {
      const name = input.opponentName?.trim() || "your opponent";
      return `Waiting for ${name}'s location.`;
    }
  }
  return arenaProximityMessage(input.opponentName);
}

/**
 * The title over an Arena start the proximity gate refused, matching the
 * message: my side's reading missing is "Location needed", the other
 * side's is "Waiting for ALEX", anything else (both missing, too far apart,
 * `proximity_failed`, no DETAIL) is "Not on the same mat".
 */
export function arenaProximityTitle(input: {
  hint: "proximity_required" | "proximity_failed";
  detail: string | null | undefined;
  selfRole: ArenaChallengeRole;
  opponentName: string | null | undefined;
}): string {
  if (input.hint === "proximity_required") {
    const missing = input.detail?.trim();
    if (missing === input.selfRole) return "Location needed";
    if (missing === "challenger" || missing === "opponent") {
      return `Waiting for ${input.opponentName?.trim() || "your opponent"}`;
    }
  }
  return "Not on the same mat";
}

/** What a failed Start match says: a strip-sized line plus the full copy. */
export interface StartBookingErrorView {
  /** Fits the Booked strip (BOOKED_STRIP_MAX_CHARS for a name up to 12 chars). */
  short: string;
  full: string;
  /** The booking is gone: remove it and toast `full`. */
  closed?: boolean;
}

/**
 * Copy for a `start_invite_booking` failure code (or an RPC hint). `role` is
 * this athlete's side of the booking: the busy and cap codes name a side, so
 * the copy says whether it is me or my opponent.
 */
export function startBookingErrorView(
  code: string,
  ctx: { role: "inviter" | "invitee"; opponentName: string },
): StartBookingErrorView {
  const alex = ctx.opponentName;
  const meIsInviter = ctx.role === "inviter";
  switch (code) {
    case "inviter_busy":
    case "claimer_busy": {
      const meBusy = (code === "inviter_busy") === meIsInviter;
      return meBusy
        ? { short: CLAIMER_BUSY_STRIP_COPY, full: `Finish your current match first. Your booking with ${alex} is saved.` }
        : { short: `${alex} is mid-match. We'll hold your spot.`, full: `${alex} is mid-match. We'll hold your spot.` };
    }
    case "inviter_weekly_cap":
      return meIsInviter
        ? {
            short: "No invite matches left this week.",
            full: "You've played this week's 3 invite matches. Challenge friends from the Arena.",
          }
        : {
            short: "No invite matches left this week.",
            full: `${alex} has played this week's invite matches. You're now friends, so challenge them from the Arena.`,
          };
    case "booking_closed":
      return { short: BOOKING_CLOSED_COPY, full: BOOKING_CLOSED_COPY, closed: true };
    case "location_required":
      return {
        short: "Location needed to start. Try again.",
        full: "Matches now need your location to start. Allow location, then try again.",
      };
    default:
      return {
        short: "Couldn't start. Try again.",
        full: "Couldn't start the match. Check your connection and try again.",
      };
  }
}

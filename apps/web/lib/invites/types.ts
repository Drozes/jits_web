/**
 * Web-local types for the 016 invite RPCs (contract section 4). The web slice
 * must not edit packages/shared, so these mirror the frozen contract shapes
 * until the generated DB types and shared wrappers land.
 */

export type InviteKind = "join" | "challenge";

export interface PreviewInviter {
  first_name: string | null;
  last_initial: string | null;
  avatar_url: string | null;
  current_elo: number;
  weight_lbs: number | null;
}

/** get_invite_preview_server (4.7). Exhaustive allowlist. */
export type InvitePreview =
  | {
      state: "open";
      kind: InviteKind;
      inviter: PreviewInviter;
      short_code_display: string | null;
    }
  | { state: "unavailable" };

export interface InviterCard {
  athlete_id: string;
  first_name: string | null;
  last_initial: string | null;
  display_name: string;
  avatar_url: string | null;
  current_elo: number;
  weight_lbs: number | null;
}

export type StartBlockedReason =
  | null
  | "no_location"
  | "waiting"
  | "far"
  | "stale"
  | "inviter_busy"
  | "claimer_busy";

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

/** claim_challenge_invite (4.10). */
export type ClaimResult =
  | {
      ok: true;
      result: "started" | "booked" | "already_claimed";
      invite_id: string;
      challenge_id: string;
      match_id: string | null;
      booking_expires_at: string | null;
      inviter: InviterCard;
      start_blocked_reason: StartBlockedReason;
    }
  | {
      ok: false;
      code: ClaimFailureCode;
      inviter: InviterCard | null;
      attempts_left?: number | null;
      retry_after_s?: number | null;
    };

export type JoinFailureCode = "invalid" | "self" | "revoked" | "claimer_not_active";

/** accept_join_invite (4.9). */
export type AcceptJoinResult =
  | { ok: true; result: "friends" | "already_friends"; inviter: InviterCard }
  | { ok: false; code: JoinFailureCode };

export type AttributionResult =
  | {
      ok: true;
      result: "attributed" | "already_attributed" | "existing_user" | "self" | "invalid";
    }
  | { ok: false; code: "throttled"; retry_after_s: number };

export type LandingStep =
  | "landing_viewed"
  | "open_in_app_tapped"
  | "app_store_tapped"
  | "link_copied"
  | "code_viewed";

export type InAppBrowser = "instagram" | "facebook" | "messenger" | "other" | null;

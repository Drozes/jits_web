import type { PostgrestError } from "@supabase/supabase-js";

/** Domain error codes mapped from RLS violations and RPC errors */
export type DomainErrorCode =
  | "MAX_PENDING_CHALLENGES"
  | "OPPONENT_INACTIVE"
  | "SELF_CHALLENGE"
  | "CHALLENGE_NOT_ACCEPTED"
  | "MATCH_ALREADY_EXISTS"
  | "VIDEO_ALREADY_EXISTS"
  | "MATCH_NOT_IN_PROGRESS"
  | "MATCH_NOT_PENDING"
  | "INVALID_RESULT"
  | "NOT_PARTICIPANT"
  | "SELF_CONVERSATION"
  | "INVALID_ATHLETE"
  | "SEND_REQUIRES_ACTIVE"
  | "SESSION_NOT_FOUND"
  | "SESSION_FULL"
  | "ALREADY_JOINED"
  | "SESSION_NOT_ACTIVE"
  | "NOT_SESSION_PARTICIPANT"
  | "WAIVER_REQUIRED"
  | "MATCH_NOT_PAUSED"
  | "ALREADY_CONFIRMED"
  | "ALREADY_DISPUTED"
  | "NOT_GYM_MANAGER"
  | "NOT_GYM_MEMBER"
  | "NOT_FOUNDER"
  | "LAST_FOUNDER"
  | "NOT_ADMIN"
  | "ATHLETE_NOT_FOUND"
  | "GYM_NOT_FOUND"
  | "MATCH_NOT_FOUND"
  | "VIDEO_FILE_MISSING"
  | "HIGHLIGHTS_DISABLED"
  | "HIGHLIGHT_NOT_FOUND"
  | "HIGHLIGHT_NOT_READY"
  | "HIGHLIGHT_SOURCE_NOT_READY"
  | "HIGHLIGHT_RENDER_IN_PROGRESS"
  | "HIGHLIGHT_RENDER_LIMIT"
  | "HIGHLIGHT_REGEN_UNAVAILABLE"
  | "HIGHLIGHT_REGEN_FAILED"
  | "HIGHLIGHT_NOT_RETRYABLE"
  | "HIGHLIGHT_FEEDBACK_INVALID"
  | "HIGHLIGHT_FEEDBACK_LIMIT"
  | "HIGHLIGHT_BAD_SEGMENTS"
  | "RLS_VIOLATION"
  | "UNKNOWN";

export interface DomainError {
  code: DomainErrorCode;
  message: string;
  raw?: PostgrestError;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: DomainError };

/** Map hint strings from RAISE EXCEPTION ... USING HINT to domain codes */
const HINT_TO_CODE: Record<string, { code: DomainErrorCode; message: string }> =
  {
    not_participant: {
      code: "NOT_PARTICIPANT",
      message: "You are not a participant in this match.",
    },
    not_found: { code: "UNKNOWN", message: "Match not found." },
    match_not_found: { code: "MATCH_NOT_FOUND", message: "Match not found." },
    invalid_status: {
      code: "MATCH_NOT_PENDING",
      message: "This match has already been started.",
    },
    invalid_result: {
      code: "INVALID_RESULT",
      message: "Invalid result type.",
    },
    missing_fields: {
      code: "INVALID_RESULT",
      message: "A submission needs a winner, a submission type and a finish time.",
    },
    invalid_winner: {
      code: "NOT_PARTICIPANT",
      message: "Winner is not a participant in this match.",
    },
    invalid_submission_type: {
      code: "INVALID_RESULT",
      message: "Invalid submission type.",
    },
    invalid_finish_time: {
      code: "INVALID_RESULT",
      message: "Finish time must be at least 0:01 and no later than the end of the match.",
    },
    not_accepted: {
      code: "CHALLENGE_NOT_ACCEPTED",
      message: "Challenge has not been accepted yet.",
    },
    session_not_found: {
      code: "SESSION_NOT_FOUND",
      message: "Session not found.",
    },
    session_full: {
      code: "SESSION_FULL",
      message: "This session is full.",
    },
    already_joined: {
      code: "ALREADY_JOINED",
      message: "You have already joined this session.",
    },
    session_not_active: {
      code: "SESSION_NOT_ACTIVE",
      message: "This session is not currently active.",
    },
    not_session_participant: {
      code: "NOT_SESSION_PARTICIPANT",
      message: "You are not a participant in this session.",
    },
    waiver_required: {
      code: "WAIVER_REQUIRED",
      message: "You must sign the waiver before joining.",
    },
    match_not_paused: {
      code: "MATCH_NOT_PAUSED",
      message: "Match is not currently paused.",
    },
    already_confirmed: {
      code: "ALREADY_CONFIRMED",
      message: "You have already confirmed this result.",
    },
    already_disputed: {
      code: "ALREADY_DISPUTED",
      message: "This result has already been disputed.",
    },
    already_paused: {
      code: "MATCH_NOT_IN_PROGRESS",
      message: "Match is already paused.",
    },
    not_gym_manager: {
      code: "NOT_GYM_MANAGER",
      message: "You are not a manager of this gym.",
    },
    not_member: {
      code: "NOT_GYM_MEMBER",
      message: "This athlete is not a member of your gym.",
    },
    not_founder: {
      code: "NOT_FOUNDER",
      message: "Only a founder can change platform roles.",
    },
    last_founder: {
      code: "LAST_FOUNDER",
      message: "Cannot remove the last founder.",
    },
    athlete_not_found: {
      code: "ATHLETE_NOT_FOUND",
      message: "That athlete could not be found.",
    },
    gym_not_found: {
      code: "GYM_NOT_FOUND",
      message: "That gym could not be found.",
    },
    not_admin: {
      code: "NOT_ADMIN",
      message: "You need admin access to do that.",
    },
    // Highlight reels (jr_be spec 014 section 9.5). The same table serves the
    // RPCs (P0001 HINT) and the highlight-regenerate edge function's
    // {ok:false,error:{hint}} body, via domainErrorFromHint.
    highlight_no_athlete: {
      code: "ATHLETE_NOT_FOUND",
      message: "Sign in to see your highlight.",
    },
    highlight_not_participant: {
      code: "NOT_PARTICIPANT",
      message: "You are not in this match.",
    },
    highlight_clips_disabled: {
      code: "HIGHLIGHTS_DISABLED",
      message: "Highlight reels are paused right now.",
    },
    highlight_not_found: {
      code: "HIGHLIGHT_NOT_FOUND",
      message: "That highlight no longer exists.",
    },
    highlight_not_ready: {
      code: "HIGHLIGHT_NOT_READY",
      message: "Your highlight isn't ready yet.",
    },
    // The SOURCE video is gone or not analysed (retry_highlight_render,
    // request_highlight_clip): about the match video, not the reel.
    highlight_source_not_ready: {
      code: "HIGHLIGHT_SOURCE_NOT_READY",
      message: "Your match video isn't available for a highlight right now.",
    },
    highlight_render_in_progress: {
      code: "HIGHLIGHT_RENDER_IN_PROGRESS",
      message: "A new version is already being made.",
    },
    highlight_render_limit: {
      code: "HIGHLIGHT_RENDER_LIMIT",
      message: "You've used all versions for this reel.",
    },
    highlight_regen_unavailable: {
      code: "HIGHLIGHT_REGEN_UNAVAILABLE",
      message: "This reel can't be regenerated.",
    },
    highlight_regen_ai_failed: {
      code: "HIGHLIGHT_REGEN_FAILED",
      message: "We couldn't work out a better cut. Try different feedback.",
    },
    highlight_not_retryable: {
      code: "HIGHLIGHT_NOT_RETRYABLE",
      message: "This reel doesn't need a retry.",
    },
    highlight_bad_feedback: {
      code: "HIGHLIGHT_FEEDBACK_INVALID",
      message: "We couldn't save that feedback.",
    },
    // Split out of HIGHLIGHT_FEEDBACK_INVALID (spec 9.5 lumps them) at the
    // B6 implementer's request: it is a 409 rate cap, not a bad payload.
    highlight_feedback_limit: {
      code: "HIGHLIGHT_FEEDBACK_LIMIT",
      message: "You've sent a lot of feedback on this reel. Try again later.",
    },
    highlight_bad_segments: {
      code: "HIGHLIGHT_BAD_SEGMENTS",
      message: "Those moments can't make a reel.",
    },
    highlight_too_long: {
      code: "HIGHLIGHT_BAD_SEGMENTS",
      message: "Those moments can't make a reel.",
    },
    highlight_too_short: {
      code: "HIGHLIGHT_BAD_SEGMENTS",
      message: "Those moments can't make a reel.",
    },
    highlight_segment_out_of_range: {
      code: "HIGHLIGHT_BAD_SEGMENTS",
      message: "Those moments can't make a reel.",
    },
  };

/** Own-property lookup, so a hint like "constructor" never hits the prototype. */
function lookupHint(
  hint: string | null | undefined,
): { code: DomainErrorCode; message: string } | undefined {
  if (!hint || !Object.prototype.hasOwnProperty.call(HINT_TO_CODE, hint)) {
    return undefined;
  }
  return HINT_TO_CODE[hint];
}

/**
 * Map a backend HINT code to a domain error. Known hints get the table's
 * user-safe message; an unknown or missing hint is UNKNOWN carrying `message`
 * (or a generic fallback). Used for RPC errors (via mapPostgrestError) and for
 * edge-function error bodies that carry a hint, so there is one table.
 */
export function domainErrorFromHint(
  hint: string | null | undefined,
  message?: string | null,
): DomainError {
  const mapped = lookupHint(hint);
  if (mapped) return { ...mapped };
  return { code: "UNKNOWN", message: message || "Something went wrong." };
}

/** Map a PostgrestError to a domain error */
export function mapPostgrestError(
  error: PostgrestError,
  context?: string,
): DomainError {
  // P0001 = business logic RAISE EXCEPTION — use hint for mapping
  if (error.code === "P0001" && error.hint) {
    const mapped = lookupHint(error.hint);
    if (mapped) return { ...mapped, raw: error };
  }

  if (error.code === "42501") {
    // RLS violation — infer from context
    if (context === "challenge_create") {
      return {
        code: "MAX_PENDING_CHALLENGES",
        message: "You already have 3 pending challenges.",
        raw: error,
      };
    }
    return { code: "RLS_VIOLATION", message: error.message, raw: error };
  }

  if (error.code === "23505") {
    // Unique constraint violation — infer from context
    if (context === "session_join") {
      return {
        code: "ALREADY_JOINED",
        message: "You have already joined this session.",
        raw: error,
      };
    }
    if (context === "match_video_create") {
      // uq_match_video_uploader: one video row per (match, uploader).
      return {
        code: "VIDEO_ALREADY_EXISTS",
        message: "A video has already been uploaded for this match.",
        raw: error,
      };
    }
    return {
      code: "MATCH_ALREADY_EXISTS",
      message: "A match already exists for this challenge.",
      raw: error,
    };
  }

  return { code: "UNKNOWN", message: error.message, raw: error };
}

/** Map an RPC JSONB error response to a domain error */
export function mapRpcError(response: {
  success: boolean;
  error?: string;
}): DomainError {
  const msg = response.error ?? "Unknown error";

  if (msg.includes("not accepted") || msg.includes("not in accepted"))
    return { code: "CHALLENGE_NOT_ACCEPTED", message: msg };
  if (msg.includes("not in_progress") || msg.includes("not in progress"))
    return { code: "MATCH_NOT_IN_PROGRESS", message: msg };
  if (msg.includes("not pending"))
    return { code: "MATCH_NOT_PENDING", message: msg };
  if (msg.includes("not a participant"))
    return { code: "NOT_PARTICIPANT", message: msg };
  if (msg.includes("Invalid result") || msg.includes("invalid result"))
    return { code: "INVALID_RESULT", message: msg };
  if (msg.includes("yourself"))
    return { code: "SELF_CONVERSATION", message: msg };
  if (msg.includes("not found or not active"))
    return { code: "INVALID_ATHLETE", message: msg };

  return { code: "UNKNOWN", message: msg };
}

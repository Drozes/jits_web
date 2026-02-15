import type { PostgrestError } from "@supabase/supabase-js";

/** Domain error codes mapped from RLS violations and RPC errors */
export type DomainErrorCode =
  | "MAX_PENDING_CHALLENGES"
  | "OPPONENT_INACTIVE"
  | "SELF_CHALLENGE"
  | "CHALLENGE_NOT_ACCEPTED"
  | "MATCH_ALREADY_EXISTS"
  | "MATCH_NOT_IN_PROGRESS"
  | "MATCH_NOT_PENDING"
  | "INVALID_RESULT"
  | "NOT_PARTICIPANT"
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

/** Map a PostgrestError (42501 = RLS violation) to a domain error */
export function mapPostgrestError(
  error: PostgrestError,
  context?: string,
): DomainError {
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
    // Unique constraint violation
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

  return { code: "UNKNOWN", message: msg };
}

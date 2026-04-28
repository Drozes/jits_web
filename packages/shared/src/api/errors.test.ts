import { describe, it, expect } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { mapPostgrestError, mapRpcError } from "./errors";

/** Helper to build a minimal PostgrestError for testing */
function pgError(
  code: string,
  message: string,
  hint?: string,
): PostgrestError {
  return {
    code,
    message,
    details: "",
    hint: hint ?? "",
    name: "PostgrestError",
    toJSON: () => ({ name: "PostgrestError", code, message, details: "", hint: hint ?? "" }),
  };
}

describe("mapPostgrestError", () => {
  describe("P0001 hint mapping (RAISE EXCEPTION with HINT)", () => {
    it("maps 'not_participant' hint to NOT_PARTICIPANT", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "not_participant"));
      expect(result.code).toBe("NOT_PARTICIPANT");
      expect(result.message).toBe("You are not a participant in this match.");
      expect(result.raw).toBeDefined();
    });

    it("maps 'not_found' hint to UNKNOWN", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "not_found"));
      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("Match not found.");
    });

    it("maps 'invalid_status' hint to MATCH_NOT_PENDING", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "invalid_status"));
      expect(result.code).toBe("MATCH_NOT_PENDING");
      expect(result.message).toBe("This match has already been started.");
    });

    it("maps 'invalid_result' hint to INVALID_RESULT", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "invalid_result"));
      expect(result.code).toBe("INVALID_RESULT");
      expect(result.message).toBe("Invalid result type.");
    });

    it("maps 'missing_fields' hint to INVALID_RESULT", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "missing_fields"));
      expect(result.code).toBe("INVALID_RESULT");
      expect(result.message).toBe("Missing required fields for submission.");
    });

    it("maps 'invalid_winner' hint to NOT_PARTICIPANT", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "invalid_winner"));
      expect(result.code).toBe("NOT_PARTICIPANT");
      expect(result.message).toBe("Winner is not a participant in this match.");
    });

    it("maps 'invalid_submission_type' hint to INVALID_RESULT", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "invalid_submission_type"));
      expect(result.code).toBe("INVALID_RESULT");
      expect(result.message).toBe("Invalid submission type.");
    });

    it("maps 'invalid_finish_time' hint to INVALID_RESULT", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "invalid_finish_time"));
      expect(result.code).toBe("INVALID_RESULT");
      expect(result.message).toBe("Finish time must be between 1 and match duration.");
    });

    it("maps 'not_accepted' hint to CHALLENGE_NOT_ACCEPTED", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "not_accepted"));
      expect(result.code).toBe("CHALLENGE_NOT_ACCEPTED");
      expect(result.message).toBe("Challenge has not been accepted yet.");
    });

    it("maps 'session_not_found' hint to SESSION_NOT_FOUND", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "session_not_found"));
      expect(result.code).toBe("SESSION_NOT_FOUND");
      expect(result.message).toBe("Session not found.");
    });

    it("maps 'session_full' hint to SESSION_FULL", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "session_full"));
      expect(result.code).toBe("SESSION_FULL");
      expect(result.message).toBe("This session is full.");
    });

    it("maps 'already_joined' hint to ALREADY_JOINED", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "already_joined"));
      expect(result.code).toBe("ALREADY_JOINED");
      expect(result.message).toBe("You have already joined this session.");
    });

    it("maps 'session_not_active' hint to SESSION_NOT_ACTIVE", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "session_not_active"));
      expect(result.code).toBe("SESSION_NOT_ACTIVE");
      expect(result.message).toBe("This session is not currently active.");
    });

    it("maps 'not_session_participant' hint to NOT_SESSION_PARTICIPANT", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "not_session_participant"));
      expect(result.code).toBe("NOT_SESSION_PARTICIPANT");
      expect(result.message).toBe("You are not a participant in this session.");
    });

    it("maps 'waiver_required' hint to WAIVER_REQUIRED", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "waiver_required"));
      expect(result.code).toBe("WAIVER_REQUIRED");
      expect(result.message).toBe("You must sign the waiver before joining.");
    });

    it("maps 'match_not_paused' hint to MATCH_NOT_PAUSED", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "match_not_paused"));
      expect(result.code).toBe("MATCH_NOT_PAUSED");
      expect(result.message).toBe("Match is not currently paused.");
    });

    it("maps 'already_confirmed' hint to ALREADY_CONFIRMED", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "already_confirmed"));
      expect(result.code).toBe("ALREADY_CONFIRMED");
      expect(result.message).toBe("You have already confirmed this result.");
    });

    it("maps 'already_disputed' hint to ALREADY_DISPUTED", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "already_disputed"));
      expect(result.code).toBe("ALREADY_DISPUTED");
      expect(result.message).toBe("This result has already been disputed.");
    });

    it("maps 'already_paused' hint to MATCH_NOT_IN_PROGRESS", () => {
      const result = mapPostgrestError(pgError("P0001", "err", "already_paused"));
      expect(result.code).toBe("MATCH_NOT_IN_PROGRESS");
      expect(result.message).toBe("Match is already paused.");
    });

    it("falls through to UNKNOWN for P0001 with unrecognized hint", () => {
      const result = mapPostgrestError(pgError("P0001", "some DB error", "unknown_hint"));
      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("some DB error");
    });

    it("falls through to UNKNOWN for P0001 with no hint", () => {
      const result = mapPostgrestError(pgError("P0001", "raised without hint"));
      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("raised without hint");
    });
  });

  describe("42501 RLS violation", () => {
    it("maps to MAX_PENDING_CHALLENGES with challenge_create context", () => {
      const result = mapPostgrestError(
        pgError("42501", "RLS policy violation"),
        "challenge_create",
      );
      expect(result.code).toBe("MAX_PENDING_CHALLENGES");
      expect(result.message).toBe("You already have 3 pending challenges.");
    });

    it("maps to RLS_VIOLATION without context", () => {
      const result = mapPostgrestError(pgError("42501", "access denied"));
      expect(result.code).toBe("RLS_VIOLATION");
      expect(result.message).toBe("access denied");
    });

    it("maps to RLS_VIOLATION with non-challenge context", () => {
      const result = mapPostgrestError(
        pgError("42501", "nope"),
        "some_other_context",
      );
      expect(result.code).toBe("RLS_VIOLATION");
      expect(result.message).toBe("nope");
    });
  });

  describe("23505 unique constraint violation", () => {
    it("maps to ALREADY_JOINED with session_join context", () => {
      const result = mapPostgrestError(
        pgError("23505", "duplicate key"),
        "session_join",
      );
      expect(result.code).toBe("ALREADY_JOINED");
      expect(result.message).toBe("You have already joined this session.");
    });

    it("maps to MATCH_ALREADY_EXISTS without context", () => {
      const result = mapPostgrestError(pgError("23505", "duplicate key"));
      expect(result.code).toBe("MATCH_ALREADY_EXISTS");
      expect(result.message).toBe("A match already exists for this challenge.");
    });

    it("maps to MATCH_ALREADY_EXISTS with unknown context", () => {
      const result = mapPostgrestError(
        pgError("23505", "duplicate"),
        "random_context",
      );
      expect(result.code).toBe("MATCH_ALREADY_EXISTS");
    });
  });

  describe("unknown error codes", () => {
    it("returns UNKNOWN for unrecognized PostgreSQL error codes", () => {
      const result = mapPostgrestError(pgError("99999", "something broke"));
      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("something broke");
      expect(result.raw?.code).toBe("99999");
    });

    it("preserves the raw error on all mappings", () => {
      const raw = pgError("P0001", "err", "not_participant");
      const result = mapPostgrestError(raw);
      expect(result.raw).toBe(raw);
    });
  });
});

describe("mapRpcError", () => {
  describe("challenge-related errors", () => {
    it("maps 'not accepted' to CHALLENGE_NOT_ACCEPTED", () => {
      const result = mapRpcError({ success: false, error: "Challenge not accepted" });
      expect(result.code).toBe("CHALLENGE_NOT_ACCEPTED");
    });

    it("maps 'not in accepted' to CHALLENGE_NOT_ACCEPTED", () => {
      const result = mapRpcError({ success: false, error: "Status is not in accepted state" });
      expect(result.code).toBe("CHALLENGE_NOT_ACCEPTED");
    });
  });

  describe("match status errors", () => {
    it("maps 'not in_progress' to MATCH_NOT_IN_PROGRESS", () => {
      const result = mapRpcError({ success: false, error: "Match is not in_progress" });
      expect(result.code).toBe("MATCH_NOT_IN_PROGRESS");
    });

    it("maps 'not in progress' (with space) to MATCH_NOT_IN_PROGRESS", () => {
      const result = mapRpcError({ success: false, error: "Match not in progress yet" });
      expect(result.code).toBe("MATCH_NOT_IN_PROGRESS");
    });

    it("maps 'not pending' to MATCH_NOT_PENDING", () => {
      const result = mapRpcError({ success: false, error: "Match is not pending" });
      expect(result.code).toBe("MATCH_NOT_PENDING");
    });
  });

  describe("participant errors", () => {
    it("maps 'not a participant' to NOT_PARTICIPANT", () => {
      const result = mapRpcError({ success: false, error: "You are not a participant" });
      expect(result.code).toBe("NOT_PARTICIPANT");
    });
  });

  describe("result validation errors", () => {
    it("maps 'Invalid result' (capital I) to INVALID_RESULT", () => {
      const result = mapRpcError({ success: false, error: "Invalid result type" });
      expect(result.code).toBe("INVALID_RESULT");
    });

    it("maps 'invalid result' (lowercase) to INVALID_RESULT", () => {
      const result = mapRpcError({ success: false, error: "The invalid result was rejected" });
      expect(result.code).toBe("INVALID_RESULT");
    });
  });

  describe("conversation errors", () => {
    it("maps 'yourself' to SELF_CONVERSATION", () => {
      const result = mapRpcError({ success: false, error: "Cannot message yourself" });
      expect(result.code).toBe("SELF_CONVERSATION");
    });
  });

  describe("athlete errors", () => {
    it("maps 'not found or not active' to INVALID_ATHLETE", () => {
      const result = mapRpcError({ success: false, error: "Athlete not found or not active" });
      expect(result.code).toBe("INVALID_ATHLETE");
    });
  });

  describe("fallback behavior", () => {
    it("returns UNKNOWN for unrecognized error messages", () => {
      const result = mapRpcError({ success: false, error: "Something completely unexpected" });
      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("Something completely unexpected");
    });

    it("uses 'Unknown error' when error field is missing", () => {
      const result = mapRpcError({ success: false });
      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("Unknown error");
    });

    it("uses 'Unknown error' when error field is undefined", () => {
      const result = mapRpcError({ success: false, error: undefined });
      expect(result.code).toBe("UNKNOWN");
      expect(result.message).toBe("Unknown error");
    });
  });
});

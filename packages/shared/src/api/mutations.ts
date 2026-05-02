import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type {
  StartMatchResponse,
  StartMatchTimerResponse,
  RecordResultResponse,
} from "../types/composites";
import {
  type Result,
  mapPostgrestError,
} from "./errors";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Challenge mutations
// ---------------------------------------------------------------------------

interface CreateChallengeParams {
  opponentId: string;
  matchType: "ranked" | "casual";
  challengerWeight?: number;
  proposedGymId?: string;
}

/** Create a new challenge. Maps RLS errors to domain errors. */
export async function createChallenge(
  supabase: Client,
  params: CreateChallengeParams,
): Promise<Result<{ id: string }>> {
  const authResult = await supabase.rpc("auth_athlete_id");
  if (authResult.error || !authResult.data) {
    return { ok: false, error: { code: "UNKNOWN" as const, message: "Could not identify current athlete" } };
  }

  const { data, error } = await supabase
    .from("challenges")
    .insert({
      challenger_id: authResult.data,
      opponent_id: params.opponentId,
      match_type: params.matchType,
      challenger_weight: params.challengerWeight,
      proposed_gym_id: params.proposedGymId,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: mapPostgrestError(error, "challenge_create") };
  }
  return { ok: true, data: { id: data.id } };
}

interface AcceptChallengeParams {
  challengeId: string;
  opponentWeight?: number;
}

/** Accept a pending challenge. Only the opponent can call this. */
export async function acceptChallenge(
  supabase: Client,
  params: AcceptChallengeParams,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("challenges")
    .update({
      status: "accepted",
      opponent_weight: params.opponentWeight,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.challengeId)
    .eq("status", "pending");

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Decline a pending challenge. Only the opponent can call this. */
export async function declineChallenge(
  supabase: Client,
  challengeId: string,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("challenges")
    .update({
      status: "declined",
      updated_at: new Date().toISOString(),
    })
    .eq("id", challengeId)
    .eq("status", "pending");

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Cancel a pending or accepted challenge. Either party can call this. */
export async function cancelChallenge(
  supabase: Client,
  challengeId: string,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("challenges")
    .update({ status: "cancelled" })
    .eq("id", challengeId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Match lifecycle mutations (RPC wrappers)
// ---------------------------------------------------------------------------

/** Create a match from an accepted challenge. Idempotent. */
export async function startMatchFromChallenge(
  supabase: Client,
  challengeId: string,
): Promise<Result<StartMatchResponse>> {
  const { data, error } = await supabase.rpc("start_match_from_challenge", {
    p_challenge_id: challengeId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  // This RPC returns match data directly (no success wrapper).
  // Errors come as PostgreSQL exceptions caught above.
  const response = data as unknown as StartMatchResponse;
  return { ok: true, data: response };
}

/** Transition a match from pending to in_progress (start the timer). */
export async function startMatch(
  supabase: Client,
  matchId: string,
): Promise<Result<StartMatchTimerResponse>> {
  const { data, error } = await supabase.rpc("start_match", {
    p_match_id: matchId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  // Errors come as PostgreSQL exceptions caught above.
  const response = data as unknown as StartMatchTimerResponse;
  return { ok: true, data: response };
}

interface RecordResultParams {
  matchId: string;
  result: "submission" | "draw";
  winnerId?: string;
  submissionTypeCode?: string;
  finishTimeSeconds?: number;
}

/** Record the outcome of an in-progress match. Auto-calculates ELO for ranked. */
export async function recordMatchResult(
  supabase: Client,
  params: RecordResultParams,
): Promise<Result<RecordResultResponse>> {
  const { data, error } = await supabase.rpc("record_match_result", {
    p_match_id: params.matchId,
    p_result: params.result,
    p_winner_id: params.winnerId,
    p_submission_type_code: params.submissionTypeCode,
    p_finish_time_seconds: params.finishTimeSeconds,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  // Errors come as PostgreSQL exceptions caught above.
  const response = data as unknown as RecordResultResponse;
  return { ok: true, data: response };
}

// ---------------------------------------------------------------------------
// Session mutations
// ---------------------------------------------------------------------------

/** RSVP to a scheduled session */
export async function rsvpToSession(
  supabase: Client,
  sessionId: string,
): Promise<Result<void>> {
  const authResult = await supabase.rpc("auth_athlete_id");
  if (authResult.error || !authResult.data) {
    return { ok: false, error: { code: "UNKNOWN" as const, message: "Could not identify current athlete" } };
  }

  const { error } = await supabase
    .from("session_rsvps")
    .insert({ session_id: sessionId, athlete_id: authResult.data });

  if (error) {
    return { ok: false, error: mapPostgrestError(error, "session_rsvp") };
  }
  return { ok: true, data: undefined };
}

/** Cancel an existing RSVP */
export async function cancelRsvp(
  supabase: Client,
  sessionId: string,
): Promise<Result<void>> {
  const authResult = await supabase.rpc("auth_athlete_id");
  if (authResult.error || !authResult.data) {
    return { ok: false, error: { code: "UNKNOWN" as const, message: "Could not identify current athlete" } };
  }

  const { error } = await supabase
    .from("session_rsvps")
    .delete()
    .eq("session_id", sessionId)
    .eq("athlete_id", authResult.data);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Join a session lobby by inserting into session_participants */
export async function joinSessionLobby(
  supabase: Client,
  params: { sessionId: string; confirmedWeight: number },
): Promise<Result<{ participantId: string }>> {
  const authResult = await supabase.rpc("auth_athlete_id");
  if (authResult.error || !authResult.data) {
    return { ok: false, error: { code: "UNKNOWN" as const, message: "Could not identify current athlete" } };
  }

  const { data, error } = await supabase
    .from("session_participants")
    .upsert(
      {
        session_id: params.sessionId,
        athlete_id: authResult.data,
        status: "checked_in",
        weight_confirmed: params.confirmedWeight,
      },
      { onConflict: "session_id,athlete_id" },
    )
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: mapPostgrestError(error, "session_join") };
  }
  return { ok: true, data: { participantId: data.id } };
}

/** Accept a session waiver. Duplicate acknowledgements are treated as success. */
export async function acceptSessionWaiver(
  supabase: Client,
  params: { sessionId: string; waiverId: string },
): Promise<Result<void>> {
  const authResult = await supabase.rpc("auth_athlete_id");
  if (authResult.error || !authResult.data) {
    return { ok: false, error: { code: "UNKNOWN" as const, message: "Could not identify current athlete" } };
  }

  const { error } = await supabase
    .from("waiver_acknowledgements")
    .insert({
      waiver_id: params.waiverId,
      athlete_id: authResult.data,
      session_id: params.sessionId,
    });

  if (error) {
    // Unique constraint violation = already signed; treat as success
    if (error.code === "23505") {
      return { ok: true, data: undefined };
    }
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

interface CreateSessionParams {
  gymId: string;
  title?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  maxParticipants?: number;
  notes?: string;
}

/** Create a session at a gym. Defaults to a 2-hour session starting now. */
export async function createSession(
  supabase: Client,
  gymIdOrParams: string | CreateSessionParams,
): Promise<Result<{ id: string }>> {
  const params =
    typeof gymIdOrParams === "string"
      ? { gymId: gymIdOrParams }
      : gymIdOrParams;

  const now = new Date();
  const start = params.scheduledStart ?? now.toISOString();
  const end =
    params.scheduledEnd ?? new Date(new Date(start).getTime() + 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.rpc("create_session", {
    p_gym_id: params.gymId,
    p_scheduled_start: start,
    p_scheduled_end: end,
    p_title: params.title,
    p_max_participants: params.maxParticipants,
    p_notes: params.notes,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: { id: data } };
}

interface UpdateSessionParams {
  title?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  maxParticipants?: number | null;
  notes?: string | null;
}

/** Update session fields. Only the session creator can update (RLS-enforced). */
export async function updateSession(
  supabase: Client,
  sessionId: string,
  fields: UpdateSessionParams,
): Promise<Result<void>> {
  const update: Database["public"]["Tables"]["sessions"]["Update"] = {};
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.scheduledStart !== undefined) update.scheduled_start = fields.scheduledStart;
  if (fields.scheduledEnd !== undefined) update.scheduled_end = fields.scheduledEnd;
  if (fields.maxParticipants !== undefined) update.max_participants = fields.maxParticipants;
  if (fields.notes !== undefined) update.notes = fields.notes;

  const { error } = await supabase
    .from("sessions")
    .update(update)
    .eq("id", sessionId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Cancel a session. Sets status to 'cancelled'. */
export async function cancelSession(
  supabase: Client,
  sessionId: string,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Activate a scheduled session. Sets status to 'active'. */
export async function activateSession(
  supabase: Client,
  sessionId: string,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("sessions")
    .update({ status: "active" })
    .eq("id", sessionId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Complete an active session. Sets status to 'completed'. */
export async function completeSession(
  supabase: Client,
  sessionId: string,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("sessions")
    .update({ status: "completed" })
    .eq("id", sessionId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Create an in-session match via RPC */
export async function createInSessionMatch(
  supabase: Client,
  params: { sessionId: string; opponentId: string },
): Promise<Result<{ matchId: string }>> {
  const { data, error } = await supabase.rpc("create_session_match", {
    p_session_id: params.sessionId,
    p_opponent_id: params.opponentId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const result = data as unknown as { match_id: string };
  return { ok: true, data: { matchId: result.match_id } };
}

/** Leave a session lobby by setting status to 'left' */
export async function leaveSessionLobby(
  supabase: Client,
  sessionId: string,
): Promise<Result<void>> {
  const authResult = await supabase.rpc("auth_athlete_id");
  if (authResult.error || !authResult.data) {
    return { ok: false, error: { code: "UNKNOWN" as const, message: "Could not identify current athlete" } };
  }

  const { error } = await supabase
    .from("session_participants")
    .update({ status: "left" })
    .eq("session_id", sessionId)
    .eq("athlete_id", authResult.data);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Request a random match within a session */
export async function requestRandomMatch(
  supabase: Client,
  sessionId: string,
): Promise<Result<{ matchId: string; opponentId: string; opponentName: string }>> {
  const { data, error } = await supabase.rpc("random_match", {
    p_session_id: sessionId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const result = data as unknown as { match_id: string; opponent_id: string; opponent_name: string };
  return { ok: true, data: { matchId: result.match_id, opponentId: result.opponent_id, opponentName: result.opponent_name } };
}

// ---------------------------------------------------------------------------
// Session match lifecycle mutations (RPC wrappers)
// ---------------------------------------------------------------------------

/** Pause an in-progress match timer. Returns the paused_at timestamp. */
export async function pauseMatch(
  supabase: Client,
  matchId: string,
): Promise<Result<{ paused_at: string }>> {
  const { data, error } = await supabase.rpc("pause_match", {
    p_match_id: matchId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const response = data as unknown as { paused_at: string };
  return { ok: true, data: { paused_at: response.paused_at } };
}

/** Resume a paused match. Returns the updated total_paused_duration. */
export async function resumeMatch(
  supabase: Client,
  matchId: string,
): Promise<Result<{ total_paused_duration: number }>> {
  const { data, error } = await supabase.rpc("resume_match", {
    p_match_id: matchId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const response = data as unknown as { total_paused_duration: number };
  return { ok: true, data: { total_paused_duration: response.total_paused_duration } };
}

/** End an in-progress match (stops timer, transitions to completed). */
export async function endMatch(
  supabase: Client,
  matchId: string,
): Promise<Result<void>> {
  const { error } = await supabase.rpc("end_match", {
    p_match_id: matchId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Confirm the recorded match result. Auto-finalizes when both participants confirm. */
export async function confirmMatchResult(
  supabase: Client,
  matchId: string,
): Promise<Result<void>> {
  const { data, error } = await supabase.rpc("confirm_match_result", {
    p_match_id: matchId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const response = data as unknown as { success: boolean; error?: string };
  if (!response.success) {
    return { ok: false, error: { code: "UNKNOWN", message: response.error ?? "Failed to confirm result" } };
  }
  return { ok: true, data: undefined };
}

/** Dispute a match result. Sets match status to disputed. */
export async function disputeMatchResult(
  supabase: Client,
  matchId: string,
  reason?: string,
): Promise<Result<void>> {
  const { data, error } = await supabase.rpc("dispute_match_result", {
    p_match_id: matchId,
    p_reason: reason ?? undefined,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const response = data as unknown as { success: boolean; error?: string };
  if (!response.success) {
    return { ok: false, error: { code: "UNKNOWN", message: response.error ?? "Failed to dispute result" } };
  }
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Athlete mutations
// ---------------------------------------------------------------------------

/** Toggle looking_for_casual / looking_for_ranked preferences */
export async function toggleMatchPreferences(
  supabase: Client,
  athleteId: string,
  prefs: { lookingForCasual: boolean; lookingForRanked: boolean },
): Promise<Result<void>> {
  const { error } = await supabase
    .from("athletes")
    .update({
      looking_for_casual: prefs.lookingForCasual,
      looking_for_ranked: prefs.lookingForRanked,
    })
    .eq("id", athleteId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

interface RegisterPushDeviceParams {
  athleteId: string;
  platform: "expo" | "web";
  token: string;
  deviceLabel?: string;
}

/** Register a push notification device. Upserts on (athlete_id, token). */
export async function registerPushDevice(
  supabase: Client,
  params: RegisterPushDeviceParams,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        athlete_id: params.athleteId,
        platform: params.platform,
        token: params.token,
        device_label: params.deviceLabel,
      },
      { onConflict: "athlete_id,token" },
    );

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Remove a push notification device by ID. */
export async function removePushDevice(
  supabase: Client,
  deviceId: string,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("id", deviceId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export interface NotificationPrefs {
  enable_challenges: boolean;
  enable_chat: boolean;
  enable_matches: boolean;
}

/** Fetch current notification preferences. Returns defaults if no row exists. */
export async function getNotificationPreferences(
  supabase: Client,
): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from("notification_preferences")
    .select("enable_challenges, enable_chat, enable_matches")
    .maybeSingle();

  return {
    enable_challenges: data?.enable_challenges ?? true,
    enable_chat: data?.enable_chat ?? true,
    enable_matches: data?.enable_matches ?? true,
  };
}

/** Upsert notification preferences. */
export async function updateNotificationPreferences(
  supabase: Client,
  athleteId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { athlete_id: athleteId, ...prefs },
      { onConflict: "athlete_id" },
    );

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

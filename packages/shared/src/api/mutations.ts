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
import type { AdminCard, AdminCardStatus } from "./queries";

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
  params: { sessionId: string; opponentId: string; timekeeperId?: string },
): Promise<Result<{ matchId: string }>> {
  const { data, error } = await supabase.rpc("create_session_match", {
    p_session_id: params.sessionId,
    p_opponent_id: params.opponentId,
    p_timekeeper_id: params.timekeeperId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const result = data as unknown as { match_id: string };
  return { ok: true, data: { matchId: result.match_id } };
}

/**
 * Cancel a still-pending session match (ready-check abort). Marks the match
 * cancelled and releases BOTH session participants back to 'available'. Caller
 * must be one of the two competitors and the match must still be 'pending'.
 */
export async function cancelSessionMatch(
  supabase: Client,
  matchId: string,
): Promise<Result<void>> {
  const { error } = await supabase.rpc("cancel_session_match", {
    p_match_id: matchId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
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

/**
 * End an in-progress match (stops timer, transitions to `completed`).
 *
 * NOTE: do NOT call this from the live match flow before recording a result.
 * `record_match_result` requires `status='in_progress'` and is what completes
 * the match + applies ELO; calling `end_match` first leaves the result
 * unrecorded with no ELO (jits-ait). The live flow goes start -> record.
 * This wrapper is retained for a future "abandon / no-result" path only.
 */
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
// Match-video mutations (013 chunked-video pipeline)
// ---------------------------------------------------------------------------

/**
 * Build the canonical storage path for a match-video upload per the BE
 * contract (jr_be `specs/013-chunked-video-pipeline/INTEGRATION.md` §1.2):
 *
 *   match-videos/<match_id>/<uploader_athlete_id>/<unix_ts>.<ext>
 *
 * Returns only the key within the bucket (no `match-videos/` prefix);
 * the bucket is supplied separately on the Storage call.
 */
export function buildMatchVideoStoragePath(
  matchId: string,
  uploaderAthleteId: string,
  ext = "mp4",
): string {
  // Strip any leading dot the caller may have included.
  const cleanExt = ext.replace(/^\./, "").toLowerCase() || "mp4";
  return `${matchId}/${uploaderAthleteId}/${Date.now()}.${cleanExt}`;
}

/**
 * Allowed `match_videos.requested_tier` values per BE contract §2.1.
 * Defaults to `'standard'` v1; tier toggle UI is feature-011 follow-on.
 */
export type MatchVideoTier = "standard" | "premium";

/**
 * Allowed `match_videos.recording_type` values per BE contract §2.1.
 */
export type MatchVideoRecordingType = "self" | "timekeeper";

export interface CreateMatchVideoParams {
  /** UUID of the parent `matches` row. FE-required. */
  matchId: string;
  /**
   * UUID of the uploading athlete (NOT auth_user_id) — must equal
   * `auth_athlete_id()` under RLS. Pass `useCurrentAthlete().id` (web)
   * or `useAuth().athlete.id` (mobile).
   */
  uploaderAthleteId: string;
  /**
   * Storage key inside the `match-videos` bucket. Should be produced via
   * `buildMatchVideoStoragePath`. The slicer parses
   * `<match_id>/<uploader>/<ts>.<ext>` to derive the chunks subdir.
   */
  storagePath: string;
  /** Optional but recommended — saves a re-probe in the slicer. */
  durationSeconds?: number;
  /** Optional but recommended — slicer reads this directly. */
  fileSizeBytes?: number;
  /** Optional. AI auto-fills if NULL. */
  cameraAngle?: string;
  /** Optional. Which athlete is on the left in frame 0. */
  athleteLeftId?: string;
  /**
   * Optional tier selector. v1 UI defaults to `'standard'`; no toggle.
   */
  requestedTier?: MatchVideoTier;
  /**
   * Optional. Athlete who pressed record. Defaults to `uploaderAthleteId`
   * for `'self'` recordings; pass the timekeeper's id for `'timekeeper'`.
   */
  recordedBy?: string;
  /** Optional. `'self'` or `'timekeeper'`. */
  recordingType?: MatchVideoRecordingType;
}

/**
 * INSERT a new `match_videos` row at `status='ready'` so the slicer
 * trigger (`trg_match_videos_request_slice_*`) fires.
 *
 * BE contract: `jr_be/specs/013-chunked-video-pipeline/INTEGRATION.md`
 * §2.1 (column list), §8.1 (RLS / `uploaded_by` resolution).
 *
 * Throws on PostgREST error. On `23505` (uq_match_video_uploader unique
 * violation), callers should fall back to `upsertMatchVideo` which
 * UPDATE-back-to-`'ready'` the existing row — preserves the row id so
 * any open Realtime subscriptions keep working.
 */
export async function createMatchVideo(
  supabase: Client,
  params: CreateMatchVideoParams,
): Promise<{ id: string }> {
  const insert: Database["public"]["Tables"]["match_videos"]["Insert"] = {
    match_id: params.matchId,
    uploaded_by: params.uploaderAthleteId,
    storage_path: params.storagePath,
    status: "ready",
    requested_tier: params.requestedTier ?? "standard",
  };
  if (params.durationSeconds != null) insert.duration_seconds = params.durationSeconds;
  if (params.fileSizeBytes != null) insert.file_size_bytes = params.fileSizeBytes;
  if (params.cameraAngle != null) insert.camera_angle = params.cameraAngle;
  if (params.athleteLeftId != null) insert.athlete_left_id = params.athleteLeftId;
  if (params.recordedBy != null) insert.recorded_by = params.recordedBy;
  if (params.recordingType != null) insert.recording_type = params.recordingType;

  const { data, error } = await supabase
    .from("match_videos")
    .insert(insert)
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id };
}

/**
 * Retry-safe variant: INSERT first; on `23505` (uniq_match_video_uploader)
 * UPDATE the existing row back to `'ready'` with the new `storage_path`.
 *
 * Per BE §8.6, the UPDATE re-fires `trg_match_videos_request_slice_update`
 * only if the previous status was NOT `'ready'`. If the existing row is
 * already `'ready'`, the trigger is a no-op — callers wanting to force a
 * re-slice for the same row must DELETE then INSERT (not done here).
 */
export async function upsertMatchVideo(
  supabase: Client,
  params: CreateMatchVideoParams,
): Promise<{ id: string }> {
  try {
    return await createMatchVideo(supabase, params);
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "23505") throw err;

    const update: Database["public"]["Tables"]["match_videos"]["Update"] = {
      storage_path: params.storagePath,
      status: "ready",
      requested_tier: params.requestedTier ?? "standard",
      // Reset FE-owned columns; never touch chunk_count/slice_*_at etc.
      duration_seconds: params.durationSeconds ?? null,
      file_size_bytes: params.fileSizeBytes ?? null,
      camera_angle: params.cameraAngle ?? null,
      athlete_left_id: params.athleteLeftId ?? null,
      recorded_by: params.recordedBy ?? null,
      recording_type: params.recordingType ?? null,
    };

    const { data, error } = await supabase
      .from("match_videos")
      .update(update)
      .eq("match_id", params.matchId)
      .eq("uploaded_by", params.uploaderAthleteId)
      .select("id")
      .single();

    if (error) throw error;
    return { id: data.id };
  }
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
// Gym mutations
// ---------------------------------------------------------------------------

interface CreateGymParams {
  name: string;
  city: string;
}

/** Create a new gym. Returns the new gym ID. */
export async function createGym(
  supabase: Client,
  params: CreateGymParams,
): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase
    .from("gyms")
    .insert({ name: params.name, city: params.city })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: { id: data.id } };
}

interface UpdateGymParams {
  name?: string;
  city?: string;
}

/** Update gym fields. Only gym managers can update (RLS-enforced). */
export async function updateGym(
  supabase: Client,
  gymId: string,
  fields: UpdateGymParams,
): Promise<Result<void>> {
  const update: Database["public"]["Tables"]["gyms"]["Update"] = {};
  if (fields.name !== undefined) update.name = fields.name;
  if (fields.city !== undefined) update.city = fields.city;

  const { error } = await supabase
    .from("gyms")
    .update(update)
    .eq("id", gymId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Session template mutations
// ---------------------------------------------------------------------------

interface CreateSessionTemplateParams {
  gymId: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  maxParticipants?: number | null;
  notes?: string | null;
}

/** Create a new session template for a gym. */
export async function createSessionTemplate(
  supabase: Client,
  params: CreateSessionTemplateParams,
): Promise<Result<{ id: string }>> {
  const authResult = await supabase.rpc("auth_athlete_id");
  if (authResult.error || !authResult.data) {
    return {
      ok: false,
      error: { code: "UNKNOWN" as const, message: "Could not identify current athlete" },
    };
  }

  const { data, error } = await supabase
    .from("session_templates")
    .insert({
      gym_id: params.gymId,
      title: params.title,
      day_of_week: params.dayOfWeek,
      start_time: params.startTime,
      duration_minutes: params.durationMinutes,
      max_participants: params.maxParticipants,
      notes: params.notes,
      created_by: authResult.data,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: { id: data.id } };
}

interface UpdateSessionTemplateParams {
  title?: string;
  dayOfWeek?: number;
  startTime?: string;
  durationMinutes?: number;
  maxParticipants?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

/** Update a session template. */
export async function updateSessionTemplate(
  supabase: Client,
  templateId: string,
  fields: UpdateSessionTemplateParams,
): Promise<Result<void>> {
  const update: Database["public"]["Tables"]["session_templates"]["Update"] = {};
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.dayOfWeek !== undefined) update.day_of_week = fields.dayOfWeek;
  if (fields.startTime !== undefined) update.start_time = fields.startTime;
  if (fields.durationMinutes !== undefined) update.duration_minutes = fields.durationMinutes;
  if (fields.maxParticipants !== undefined) update.max_participants = fields.maxParticipants;
  if (fields.notes !== undefined) update.notes = fields.notes;
  if (fields.isActive !== undefined) update.is_active = fields.isActive;

  const { error } = await supabase
    .from("session_templates")
    .update(update)
    .eq("id", templateId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Delete a session template. */
export async function deleteSessionTemplate(
  supabase: Client,
  templateId: string,
): Promise<Result<void>> {
  const { error } = await supabase
    .from("session_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/** Create a live session from a template via RPC. */
export async function createSessionFromTemplate(
  supabase: Client,
  templateId: string,
  scheduledStart?: string,
): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase.rpc("create_session_from_template", {
    p_template_id: templateId,
    ...(scheduledStart ? { p_scheduled_start: scheduledStart } : {}),
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: { id: data } };
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

// ---------------------------------------------------------------------------
// Admin board (internal founder Kanban, backs web /design/board)
// ---------------------------------------------------------------------------

const ADMIN_CARD_COLS = "id, title, notes, status, created_at, updated_at";

/** Create an internal Kanban card (defaults to the To Do column). */
export async function createAdminCard(
  supabase: Client,
  params: { title: string; notes?: string | null; status?: AdminCardStatus },
): Promise<Result<AdminCard>> {
  const { data, error } = await supabase
    .from("admin_cards")
    .insert({
      title: params.title,
      notes: params.notes ?? null,
      status: params.status ?? "todo",
    })
    .select(ADMIN_CARD_COLS)
    .single();

  if (error) {
    return { ok: false, error: mapPostgrestError(error, "admin_card_create") };
  }
  return { ok: true, data: data as AdminCard };
}

/** Update an internal Kanban card's title, notes, and/or status. */
export async function updateAdminCard(
  supabase: Client,
  id: string,
  patch: { title?: string; notes?: string | null; status?: AdminCardStatus },
): Promise<Result<AdminCard>> {
  const { data, error } = await supabase
    .from("admin_cards")
    .update(patch)
    .eq("id", id)
    .select(ADMIN_CARD_COLS)
    .single();

  if (error) {
    return { ok: false, error: mapPostgrestError(error, "admin_card_update") };
  }
  return { ok: true, data: data as AdminCard };
}

/** Delete an internal Kanban card. */
export async function deleteAdminCard(
  supabase: Client,
  id: string,
): Promise<Result<{ id: string }>> {
  const { error } = await supabase.from("admin_cards").delete().eq("id", id);

  if (error) {
    return { ok: false, error: mapPostgrestError(error, "admin_card_delete") };
  }
  return { ok: true, data: { id } };
}

// ---------------------------------------------------------------------------
// Platform admin tooling (admin-tooling alpha) — founder/admin-gated RPCs.
// Both raise P0001 with a HINT mapped by mapPostgrestError:
//   admin_set_platform_role -> not_founder | last_founder | athlete_not_found
//   admin_set_feature_flag  -> not_admin
// ---------------------------------------------------------------------------

type PlatformRole = Database["public"]["Enums"]["platform_role"];

/**
 * Founder-only: set an athlete's platform role (member/admin/founder). Maps the
 * `not_founder` / `last_founder` / `athlete_not_found` HINTs to clear messages.
 */
export async function setPlatformRole(
  supabase: Client,
  params: { athleteId: string; role: PlatformRole },
): Promise<Result<void>> {
  const { error } = await supabase.rpc("admin_set_platform_role", {
    p_athlete_id: params.athleteId,
    p_role: params.role,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/**
 * Admin-only: toggle a feature flag. Maps the `not_admin` HINT to a clear
 * message (a non-admin who deep-linked past the route guard).
 */
export async function setFeatureFlag(
  supabase: Client,
  params: { key: string; enabled: boolean },
): Promise<Result<void>> {
  const { error } = await supabase.rpc("admin_set_feature_flag", {
    p_key: params.key,
    p_enabled: params.enabled,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Admin gym-owner management (admin-tooling alpha) — is_admin()-gated RPCs.
// Both run as the function owner, so they bypass the gym_managers manager-only
// INSERT RLS. They raise P0001 with a HINT mapped by mapPostgrestError:
//   admin_add_gym_manager    -> not_admin | gym_not_found | athlete_not_found
//   admin_remove_gym_manager -> not_admin
// ---------------------------------------------------------------------------

/**
 * Admin-only: grant gym-manager ("gym owner") status to an athlete at a gym,
 * bypassing the normal manager-only INSERT RLS. Idempotent. Maps the
 * `not_admin` / `gym_not_found` / `athlete_not_found` HINTs.
 */
export async function addGymManager(
  supabase: Client,
  params: { gymId: string; athleteId: string },
): Promise<Result<void>> {
  const { error } = await supabase.rpc("admin_add_gym_manager", {
    p_gym_id: params.gymId,
    p_athlete_id: params.athleteId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

/**
 * Admin-only: revoke gym-manager ("gym owner") status for an athlete at a gym.
 * Idempotent. Maps the `not_admin` HINT.
 */
export async function removeGymManager(
  supabase: Client,
  params: { gymId: string; athleteId: string },
): Promise<Result<void>> {
  const { error } = await supabase.rpc("admin_remove_gym_manager", {
    p_gym_id: params.gymId,
    p_athlete_id: params.athleteId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  return { ok: true, data: undefined };
}

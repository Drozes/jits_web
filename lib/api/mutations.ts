import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  StartMatchResponse,
  StartMatchTimerResponse,
  RecordResultResponse,
} from "@/types/composites";
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
  const { data, error } = await supabase
    .from("challenges")
    .insert({
      challenger_id: (await supabase.rpc("auth_athlete_id")).data!,
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

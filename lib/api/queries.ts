import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  EloStakes,
  MatchHistoryRow,
  EloHistoryRow,
} from "@/types/composites";
import type { SubmissionType } from "@/types/submission-type";
import { computeStats, computeWinStreak, extractGymName } from "@/lib/utils";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Athlete queries
// ---------------------------------------------------------------------------

/** Common select for athletes with gym join */
const ATHLETE_WITH_GYM_SELECT =
  "id, display_name, current_elo, highest_elo, current_weight, status, looking_for_match, free_agent, primary_gym_id, created_at, gyms!fk_athletes_primary_gym(name)" as const;

export interface AthleteWithGym {
  id: string;
  display_name: string;
  current_elo: number;
  highest_elo: number;
  current_weight: number | null;
  status: string;
  looking_for_match: boolean;
  free_agent: boolean;
  primary_gym_id: string | null;
  created_at: string;
  gymName: string | null;
}

export interface AthleteProfile extends AthleteWithGym {
  stats: { wins: number; losses: number; winRate: number };
  winStreak: number;
}

/** Fetch an athlete by ID with gym name, stats, and win streak */
export async function getAthleteProfile(
  supabase: Client,
  athleteId: string,
): Promise<AthleteProfile | null> {
  const { data: raw } = await supabase
    .from("athletes")
    .select(ATHLETE_WITH_GYM_SELECT)
    .eq("id", athleteId)
    .single();

  if (!raw) return null;

  const gymName = extractGymName(
    raw.gyms as { name: string }[] | null,
  );

  const { data: outcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", athleteId)
    .not("outcome", "is", null);

  const stats = computeStats(outcomes ?? []);

  const { data: recentOutcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", athleteId)
    .not("outcome", "is", null)
    .order("match_id", { ascending: false })
    .limit(50);

  const winStreak = computeWinStreak(recentOutcomes ?? []);

  return { ...raw, gymName, stats, winStreak };
}

/** Fetch stats for an athlete (wins, losses, winRate) */
export async function getAthleteStats(
  supabase: Client,
  athleteId: string,
): Promise<{ wins: number; losses: number; winRate: number }> {
  const { data: outcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", athleteId)
    .not("outcome", "is", null);

  return computeStats(outcomes ?? []);
}

/** Fetch top athletes by ELO with stats (for leaderboard) */
export async function getLeaderboard(
  supabase: Client,
  limit = 50,
): Promise<(AthleteWithGym & { stats: { wins: number; losses: number; winRate: number } })[]> {
  const { data: athletes } = await supabase
    .from("athletes")
    .select(ATHLETE_WITH_GYM_SELECT)
    .eq("status", "active")
    .order("current_elo", { ascending: false })
    .limit(limit);

  if (!athletes?.length) return [];

  const athleteIds = athletes.map((a) => a.id);
  const { data: allOutcomes } = await supabase
    .from("match_participants")
    .select("athlete_id, outcome")
    .in("athlete_id", athleteIds)
    .not("outcome", "is", null);

  const outcomesByAthlete = new Map<string, { outcome: string | null }[]>();
  for (const o of allOutcomes ?? []) {
    const arr = outcomesByAthlete.get(o.athlete_id) ?? [];
    arr.push(o);
    outcomesByAthlete.set(o.athlete_id, arr);
  }

  return athletes.map((a) => ({
    ...a,
    gymName: extractGymName(a.gyms as { name: string }[] | null),
    stats: computeStats(outcomesByAthlete.get(a.id) ?? []),
  }));
}

// ---------------------------------------------------------------------------
// Match history (via RPC)
// ---------------------------------------------------------------------------

/** Fetch match history for an athlete using the get_match_history RPC */
export async function getMatchHistory(
  supabase: Client,
  athleteId: string,
): Promise<MatchHistoryRow[]> {
  const { data } = await supabase.rpc("get_match_history", {
    p_athlete_id: athleteId,
  });
  return (data as MatchHistoryRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// ELO
// ---------------------------------------------------------------------------

/** Fetch ELO rating history using the get_elo_history RPC */
export async function getEloHistory(
  supabase: Client,
  athleteId: string,
): Promise<EloHistoryRow[]> {
  const { data } = await supabase.rpc("get_elo_history", {
    p_athlete_id: athleteId,
  });
  return (data as EloHistoryRow[]) ?? [];
}

/** Preview ELO stakes for a potential ranked match */
export async function getEloStakes(
  supabase: Client,
  challengerElo: number,
  opponentElo: number,
): Promise<EloStakes | null> {
  const { data } = await supabase.rpc("calculate_elo_stakes", {
    challenger_elo: challengerElo,
    opponent_elo: opponentElo,
  });
  return (data as unknown as EloStakes) ?? null;
}

// ---------------------------------------------------------------------------
// Submission types
// ---------------------------------------------------------------------------

/** Fetch all active submission types, ordered by category then sort_order */
export async function getSubmissionTypes(
  supabase: Client,
): Promise<SubmissionType[]> {
  const { data } = await supabase
    .from("submission_types")
    .select("*")
    .eq("status", "active")
    .order("category")
    .order("sort_order");
  return (data as SubmissionType[]) ?? [];
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

/** Check if athlete can create a new challenge (< 3 pending outgoing) */
export async function canCreateChallenge(
  supabase: Client,
  opponentId?: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("can_create_challenge", {
    p_opponent_id: opponentId,
  });
  return data === true;
}

// ---------------------------------------------------------------------------
// Match lobby (accepted challenge details)
// ---------------------------------------------------------------------------

export interface LobbyData {
  id: string;
  match_type: string;
  challenger_weight: number | null;
  opponent_weight: number | null;
  status: string;
  challenger: { id: string; display_name: string; current_elo: number; highest_elo: number; current_weight: number | null };
  opponent: { id: string; display_name: string; current_elo: number; highest_elo: number; current_weight: number | null };
  gym: { id: string; name: string; address: string | null; city: string | null } | null;
}

/** Fetch full challenge details for match lobby screen */
export async function getLobbyData(
  supabase: Client,
  challengeId: string,
): Promise<LobbyData | null> {
  const { data } = await supabase
    .from("challenges")
    .select(
      `*,
      challenger:athletes!fk_challenges_challenger(id, display_name, current_elo, highest_elo, current_weight),
      opponent:athletes!fk_challenges_opponent(id, display_name, current_elo, highest_elo, current_weight),
      gym:gyms!fk_challenges_gym(id, name, address, city)`,
    )
    .eq("id", challengeId)
    .eq("status", "accepted")
    .single();

  if (!data) return null;

  // Aliased FK joins return single objects (not arrays)
  const challenger = data.challenger as unknown as LobbyData["challenger"];
  const opponent = data.opponent as unknown as LobbyData["opponent"];
  const gym = (data.gym as unknown as LobbyData["gym"]) ?? null;

  return { ...data, challenger, opponent, gym };
}

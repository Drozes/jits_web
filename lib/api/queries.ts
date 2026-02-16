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
  "id, display_name, current_elo, highest_elo, current_weight, status, looking_for_casual, looking_for_ranked, free_agent, primary_gym_id, created_at, gyms!fk_athletes_primary_gym(name)" as const;

export interface AthleteWithGym {
  id: string;
  display_name: string;
  current_elo: number;
  highest_elo: number;
  current_weight: number | null;
  status: string;
  looking_for_casual: boolean;
  looking_for_ranked: boolean;
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

  // Single query for both stats and win streak (ordered, limited to 50)
  const { data: recentOutcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", athleteId)
    .not("outcome", "is", null)
    .order("match_id", { ascending: false })
    .limit(50);

  const stats = computeStats(recentOutcomes ?? []);
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

// ---------------------------------------------------------------------------
// Match details (for live + results pages)
// ---------------------------------------------------------------------------

export interface MatchParticipant {
  athlete_id: string;
  display_name: string;
  current_elo: number;
  role: string;
  outcome: string | null;
  elo_before: number | null;
  elo_after: number | null;
  elo_delta: number;
}

export interface MatchDetails {
  id: string;
  challenge_id: string;
  match_type: string;
  duration_seconds: number;
  status: string;
  result: string | null;
  started_at: string | null;
  completed_at: string | null;
  participants: MatchParticipant[];
}

/** Fetch match details with participants for live/results screens */
export async function getMatchDetails(
  supabase: Client,
  matchId: string,
): Promise<MatchDetails | null> {
  const { data } = await supabase
    .from("matches")
    .select(
      `id, challenge_id, match_type, duration_seconds, status, result, started_at, completed_at,
      match_participants(
        athlete_id, role, outcome, elo_before, elo_after, elo_delta,
        athletes!fk_participants_athlete(display_name, current_elo)
      )`,
    )
    .eq("id", matchId)
    .single();

  if (!data) return null;

  const participants = ((data.match_participants ?? []) as unknown[]).map(
    (p: unknown) => {
      const part = p as Record<string, unknown>;
      const athleteArr = part.athletes as
        | { display_name: string; current_elo: number }[]
        | null;
      const athlete = athleteArr?.[0];
      return {
        athlete_id: part.athlete_id as string,
        display_name: athlete?.display_name ?? "Unknown",
        current_elo: athlete?.current_elo ?? 1000,
        role: part.role as string,
        outcome: part.outcome as string | null,
        elo_before: part.elo_before as number | null,
        elo_after: part.elo_after as number | null,
        elo_delta: (part.elo_delta as number) ?? 0,
      };
    },
  );

  return {
    id: data.id,
    challenge_id: data.challenge_id,
    match_type: data.match_type,
    duration_seconds: data.duration_seconds,
    status: data.status,
    result: data.result,
    started_at: data.started_at,
    completed_at: data.completed_at,
    participants,
  };
}

export interface ChallengeBetween {
  id: string;
  status: string;
  match_type: string;
  created_at: string;
  expires_at: string;
  challenger_weight: number | null;
  opponent_weight: number | null;
  challenger: { id: string; display_name: string; current_elo: number };
  opponent: { id: string; display_name: string; current_elo: number };
}

/** Fetch all challenges between two athletes (bidirectional), newest first */
export async function getChallengesBetween(
  supabase: Client,
  athleteA: string,
  athleteB: string,
): Promise<ChallengeBetween[]> {
  const { data } = await supabase
    .from("challenges")
    .select(
      `id, status, match_type, created_at, expires_at, challenger_weight, opponent_weight,
      challenger:athletes!fk_challenges_challenger(id, display_name, current_elo),
      opponent:athletes!fk_challenges_opponent(id, display_name, current_elo)`,
    )
    .or(
      `and(challenger_id.eq.${athleteA},opponent_id.eq.${athleteB}),and(challenger_id.eq.${athleteB},opponent_id.eq.${athleteA})`,
    )
    .order("created_at", { ascending: false });

  if (!data) return [];

  return data.map((d) => ({
    ...d,
    challenger: d.challenger as unknown as ChallengeBetween["challenger"],
    opponent: d.opponent as unknown as ChallengeBetween["opponent"],
  }));
}

/** Find a pending challenge between two athletes (either direction) */
export async function getPendingChallengeBetween(
  supabase: Client,
  athleteA: string,
  athleteB: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("challenges")
    .select("id")
    .eq("status", "pending")
    .or(
      `and(challenger_id.eq.${athleteA},opponent_id.eq.${athleteB}),and(challenger_id.eq.${athleteB},opponent_id.eq.${athleteA})`,
    )
    .limit(1)
    .maybeSingle();

  return data ? { id: data.id } : null;
}

/** Get IDs of all athletes who have a pending challenge with this athlete (either direction) */
export async function getPendingChallengeOpponentIds(
  supabase: Client,
  athleteId: string,
): Promise<Set<string>> {
  const [{ data: sent }, { data: received }] = await Promise.all([
    supabase
      .from("challenges")
      .select("opponent_id")
      .eq("challenger_id", athleteId)
      .eq("status", "pending"),
    supabase
      .from("challenges")
      .select("challenger_id")
      .eq("opponent_id", athleteId)
      .eq("status", "pending"),
  ]);

  const ids = new Set<string>();
  for (const c of sent ?? []) ids.add(c.opponent_id);
  for (const c of received ?? []) ids.add(c.challenger_id);
  return ids;
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

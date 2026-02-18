import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  EloStakes,
  MatchHistoryRow,
  EloHistoryRow,
  DashboardSummary,
  ArenaData,
} from "@/types/composites";
import type { SubmissionType } from "@/types/submission-type";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Aggregated page RPCs (single-call replacements)
// ---------------------------------------------------------------------------

/** Fetch all dashboard data in a single RPC (stats, rank, matches, challenges, activity) */
export async function getDashboardSummary(
  supabase: Client,
): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc("get_dashboard_summary");
  if (error || !data) throw new Error("Failed to load dashboard");
  return data as unknown as DashboardSummary;
}

/** Fetch all arena page data in a single RPC (athletes, challenges, activity) */
export async function getArenaData(
  supabase: Client,
  limit = 20,
): Promise<ArenaData> {
  const { data } = await supabase.rpc("get_arena_data", { p_limit: limit });
  return data as unknown as ArenaData;
}

// ---------------------------------------------------------------------------
// Athlete stats (via RPC — bypasses match_participants RLS)
// ---------------------------------------------------------------------------

export interface AthleteStatsRpc {
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  winStreak: number;
  bestWinStreak: number;
  totalMatches: number;
}

/** Fetch stats for a single athlete (public, any athlete) */
export async function getAthleteStatsRpc(
  supabase: Client,
  athleteId: string,
): Promise<AthleteStatsRpc> {
  const { data } = await supabase.rpc("get_athlete_stats", {
    p_athlete_id: athleteId,
  });
  const row = (data as { wins: number; losses: number; draws: number; win_streak: number; best_win_streak: number; total_matches: number }[] | null)?.[0];
  const wins = row?.wins ?? 0;
  const losses = row?.losses ?? 0;
  const draws = row?.draws ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return {
    wins, losses, draws, winRate,
    winStreak: row?.win_streak ?? 0,
    bestWinStreak: row?.best_win_streak ?? 0,
    totalMatches: row?.total_matches ?? 0,
  };
}

/** Batch-fetch stats for multiple athletes (for leaderboard/swipe) */
export async function getAthletesStatsRpc(
  supabase: Client,
  athleteIds: string[],
): Promise<Map<string, { wins: number; losses: number; draws: number; totalMatches: number }>> {
  if (athleteIds.length === 0) return new Map();
  const { data } = await supabase.rpc("get_athletes_stats", {
    p_athlete_ids: athleteIds,
  });
  const map = new Map<string, { wins: number; losses: number; draws: number; totalMatches: number }>();
  for (const row of (data ?? []) as { athlete_id: string; wins: number; losses: number; draws: number; total_matches: number }[]) {
    map.set(row.athlete_id, { wins: row.wins, losses: row.losses, draws: row.draws, totalMatches: row.total_matches });
  }
  return map;
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

/** Preview ELO stakes for a potential ranked match (weight-aware) */
export async function getEloStakes(
  supabase: Client,
  challengerElo: number,
  opponentElo: number,
  challengerWeight?: number | null,
  opponentWeight?: number | null,
): Promise<EloStakes | null> {
  const { data } = await supabase.rpc("calculate_elo_stakes", {
    challenger_elo: challengerElo,
    opponent_elo: opponentElo,
    ...(challengerWeight ? { challenger_weight: challengerWeight } : {}),
    ...(opponentWeight ? { opponent_weight: opponentWeight } : {}),
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
  challenger: { id: string; display_name: string; current_elo: number; highest_elo: number; current_weight: number | null; profile_photo_url: string | null };
  opponent: { id: string; display_name: string; current_elo: number; highest_elo: number; current_weight: number | null; profile_photo_url: string | null };
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
  weight_division_gap: number | null;
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
        athlete_id, role, outcome, elo_before, elo_after, elo_delta, weight_division_gap,
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
        weight_division_gap: (part.weight_division_gap as number | null) ?? null,
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
  challenger: { id: string; display_name: string; current_elo: number; profile_photo_url: string | null };
  opponent: { id: string; display_name: string; current_elo: number; profile_photo_url: string | null };
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
      challenger:athletes!fk_challenges_challenger(id, display_name, current_elo, profile_photo_url),
      opponent:athletes!fk_challenges_opponent(id, display_name, current_elo, profile_photo_url)`,
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
      challenger:athletes!fk_challenges_challenger(id, display_name, current_elo, highest_elo, current_weight, profile_photo_url),
      opponent:athletes!fk_challenges_opponent(id, display_name, current_elo, highest_elo, current_weight, profile_photo_url),
      gym:gyms!fk_challenges_gym(id, name, address, city)`,
    )
    .eq("id", challengeId)
    .in("status", ["pending", "accepted"])
    .single();

  if (!data) return null;

  // Aliased FK joins return single objects (not arrays)
  const challenger = data.challenger as unknown as LobbyData["challenger"];
  const opponent = data.opponent as unknown as LobbyData["opponent"];
  const gym = (data.gym as unknown as LobbyData["gym"]) ?? null;

  return { ...data, challenger, opponent, gym };
}

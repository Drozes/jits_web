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
import type {
  GymListItem,
  GymDetail,
  SessionListItem,
  ActiveSessionInfo,
  SessionJoinData,
  SessionLobbyData,
  LobbyParticipant,
} from "@/types/session";

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
  profile_photo_url: string | null;
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

/** Fetch match details with participants for live/results screens. */
export async function getMatchDetails(
  supabase: Client,
  matchId: string,
): Promise<MatchDetails | null> {
  const { data, error } = await supabase.rpc("get_match_details", {
    p_match_id: matchId,
  });

  if (error || !data) return null;

  const result = data as unknown as {
    match: Omit<MatchDetails, "participants">;
    participants: MatchParticipant[];
  };

  return {
    ...result.match,
    participants: result.participants,
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

// ---------------------------------------------------------------------------
// Sessions & Gyms
// ---------------------------------------------------------------------------

/** Fetch all active gyms with session counts and member counts */
export async function getGymsWithSessions(
  supabase: Client,
): Promise<GymListItem[]> {
  // 1. Fetch active gyms
  const { data: gyms } = await supabase
    .from("gyms")
    .select("id, name, city, status")
    .eq("status", "active")
    .order("name");

  if (!gyms || gyms.length === 0) return [];

  // 2. Fetch member counts grouped by primary_gym_id
  const { data: athletes } = await supabase
    .from("athletes")
    .select("primary_gym_id")
    .eq("status", "active")
    .not("primary_gym_id", "is", null);

  const memberCountMap = new Map<string, number>();
  for (const a of athletes ?? []) {
    if (a.primary_gym_id) {
      memberCountMap.set(a.primary_gym_id, (memberCountMap.get(a.primary_gym_id) ?? 0) + 1);
    }
  }

  // 3. Fetch sessions that are active or upcoming scheduled
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, gym_id, status, scheduled_start")
    .in("status", ["active", "scheduled"]);

  const activeMap = new Map<string, number>();
  const upcomingMap = new Map<string, number>();
  const now = new Date().toISOString();

  for (const s of sessions ?? []) {
    if (s.status === "active") {
      activeMap.set(s.gym_id, (activeMap.get(s.gym_id) ?? 0) + 1);
    } else if (s.status === "scheduled" && s.scheduled_start > now) {
      upcomingMap.set(s.gym_id, (upcomingMap.get(s.gym_id) ?? 0) + 1);
    }
  }

  // 4. Build GymListItem array, sort by active sessions first then name
  const items: GymListItem[] = gyms.map((g) => {
    const activeSessions = activeMap.get(g.id) ?? 0;
    return {
      id: g.id,
      name: g.name,
      city: g.city,
      status: g.status,
      memberCount: memberCountMap.get(g.id) ?? 0,
      activeSessions,
      upcomingSessions: upcomingMap.get(g.id) ?? 0,
      hasActiveSession: activeSessions > 0,
    };
  });

  items.sort((a, b) => {
    if (a.hasActiveSession !== b.hasActiveSession) return a.hasActiveSession ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return items;
}

/** Fetch gym detail with sessions, RSVP info, and membership check */
export async function getGymDetail(
  supabase: Client,
  gymId: string,
  athleteId: string,
): Promise<GymDetail | null> {
  // 1. Fetch gym
  const { data: gym } = await supabase
    .from("gyms")
    .select("id, name, city, status")
    .eq("id", gymId)
    .single();

  if (!gym) return null;

  // 2. Fetch current/upcoming sessions for this gym
  const now = new Date().toISOString();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, title, scheduled_start, scheduled_end, status, max_participants, created_by")
    .eq("gym_id", gymId)
    .in("status", ["scheduled", "active"])
    .gt("scheduled_end", now)
    .order("scheduled_start", { ascending: true });

  // 3. For each session, get participant counts and RSVP counts
  const sessionIds = (sessions ?? []).map((s) => s.id);

  // Parallel fetch: participants, RSVPs, and creator names
  const [participantsResult, rsvpsResult, creatorsResult, athleteRsvpsResult] =
    await Promise.all([
      sessionIds.length > 0
        ? supabase.from("session_participants").select("session_id").in("session_id", sessionIds)
        : Promise.resolve({ data: [] as { session_id: string }[] }),
      sessionIds.length > 0
        ? supabase.from("session_rsvps").select("session_id").in("session_id", sessionIds)
        : Promise.resolve({ data: [] as { session_id: string }[] }),
      sessionIds.length > 0
        ? supabase
            .from("athletes")
            .select("id, display_name")
            .in("id", (sessions ?? []).map((s) => s.created_by))
        : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
      sessionIds.length > 0
        ? supabase.from("session_rsvps").select("session_id").eq("athlete_id", athleteId).in("session_id", sessionIds)
        : Promise.resolve({ data: [] as { session_id: string }[] }),
    ]);

  // Count participants per session
  const participantCountMap = new Map<string, number>();
  for (const p of participantsResult.data ?? []) {
    participantCountMap.set(p.session_id, (participantCountMap.get(p.session_id) ?? 0) + 1);
  }

  // Count RSVPs per session
  const rsvpCountMap = new Map<string, number>();
  for (const r of rsvpsResult.data ?? []) {
    rsvpCountMap.set(r.session_id, (rsvpCountMap.get(r.session_id) ?? 0) + 1);
  }

  // Creator name map
  const creatorNameMap = new Map<string, string>();
  for (const c of creatorsResult.data ?? []) {
    creatorNameMap.set(c.id, c.display_name);
  }

  // Athlete's RSVP session IDs
  const rsvpSessionIds = (athleteRsvpsResult.data ?? []).map(
    (r) => r.session_id,
  );

  // 4. Build SessionListItems
  const sessionListItems: SessionListItem[] = (sessions ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    scheduledStart: s.scheduled_start,
    scheduledEnd: s.scheduled_end,
    status: s.status,
    participantCount: participantCountMap.get(s.id) ?? 0,
    maxParticipants: s.max_participants,
    rsvpCount: rsvpCountMap.get(s.id) ?? 0,
    createdByName: creatorNameMap.get(s.created_by) ?? "Unknown",
  }));

  // 5. Check membership
  const { data: athleteRow } = await supabase
    .from("athletes")
    .select("primary_gym_id")
    .eq("id", athleteId)
    .single();

  const isMemberGym = athleteRow?.primary_gym_id === gymId;

  return {
    id: gym.id,
    name: gym.name,
    city: gym.city,
    status: gym.status,
    sessions: sessionListItems,
    rsvpSessionIds,
    isMemberGym,
  };
}

/** Fetch active or upcoming session for dashboard card */
export async function getActiveSession(
  supabase: Client,
  athleteId: string,
): Promise<ActiveSessionInfo | null> {
  // Priority 1: Active session where athlete is a participant (not 'left')
  const { data: activeParticipants } = await supabase
    .from("session_participants")
    .select("session_id")
    .eq("athlete_id", athleteId)
    .neq("status", "left");

  if (activeParticipants && activeParticipants.length > 0) {
    // Check if any of those sessions are active
    const participantSessionIds = activeParticipants.map((p) => p.session_id);
    const { data: activeSessions } = await supabase
      .from("sessions")
      .select("id, gym_id, status, scheduled_start, scheduled_end")
      .in("id", participantSessionIds)
      .eq("status", "active")
      .limit(1);

    if (activeSessions && activeSessions.length > 0) {
      const session = activeSessions[0];
      // Get gym name
      const { data: gymRow } = await supabase
        .from("gyms")
        .select("name")
        .eq("id", session.gym_id)
        .single();

      // Count participants
      const { count } = await supabase
        .from("session_participants")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);

      return {
        sessionId: session.id,
        gymId: session.gym_id,
        gymName: gymRow?.name ?? "Unknown",
        status: "active",
        scheduledStart: session.scheduled_start,
        scheduledEnd: session.scheduled_end,
        participantCount: count ?? 0,
        isRsvpd: false,
      };
    }
  }

  // Priority 2: Nearest upcoming session with an RSVP
  const { data: rsvps } = await supabase
    .from("session_rsvps")
    .select("session_id")
    .eq("athlete_id", athleteId);

  if (rsvps && rsvps.length > 0) {
    const rsvpSessionIds = rsvps.map((r) => r.session_id);
    const now = new Date().toISOString();

    const { data: upcomingSessions } = await supabase
      .from("sessions")
      .select("id, gym_id, status, scheduled_start, scheduled_end")
      .in("id", rsvpSessionIds)
      .eq("status", "scheduled")
      .gt("scheduled_start", now)
      .order("scheduled_start", { ascending: true })
      .limit(1);

    if (upcomingSessions && upcomingSessions.length > 0) {
      const session = upcomingSessions[0];
      const { data: gymRow } = await supabase
        .from("gyms")
        .select("name")
        .eq("id", session.gym_id)
        .single();

      const { count } = await supabase
        .from("session_participants")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);

      return {
        sessionId: session.id,
        gymId: session.gym_id,
        gymName: gymRow?.name ?? "Unknown",
        status: "scheduled",
        scheduledStart: session.scheduled_start,
        scheduledEnd: session.scheduled_end,
        participantCount: count ?? 0,
        isRsvpd: true,
      };
    }
  }

  return null;
}

/** Fetch session data needed by the join wizard */
export async function getSessionForJoin(
  supabase: Client,
  sessionId: string,
  athleteId: string,
): Promise<SessionJoinData | null> {
  // 1. Fetch session with gym join
  const { data: session } = await supabase
    .from("sessions")
    .select("id, gym_id, status, scheduled_start, scheduled_end, gyms!inner(name, city, latitude, longitude)")
    .eq("id", sessionId)
    .single();

  if (!session || session.status === "completed" || session.status === "cancelled") {
    return null;
  }

  const gym = session.gyms as unknown as {
    name: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  };

  // 2. Check for active app-level waiver
  const { data: activeWaiver } = await supabase
    .from("waivers")
    .select("id")
    .eq("scope", "app")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const requiresWaiver = !!activeWaiver;

  // 3. Check if athlete has signed the waiver
  let hasSignedWaiver = false;
  if (requiresWaiver && activeWaiver) {
    const { data: ack } = await supabase
      .from("waiver_acknowledgements")
      .select("id")
      .eq("waiver_id", activeWaiver.id)
      .eq("athlete_id", athleteId)
      .limit(1)
      .maybeSingle();
    hasSignedWaiver = !!ack;
  }

  // 4. Get athlete's current weight
  const { data: athlete } = await supabase
    .from("athletes")
    .select("current_weight")
    .eq("id", athleteId)
    .single();

  return {
    sessionId: session.id,
    gymName: gym.name,
    gymCity: gym.city ?? null,
    gymLatitude: gym.latitude ?? null,
    gymLongitude: gym.longitude ?? null,
    status: session.status,
    requiresWaiver,
    hasSignedWaiver,
    athleteWeight: athlete?.current_weight ?? null,
  };
}

// ---------------------------------------------------------------------------
// Session lobby
// ---------------------------------------------------------------------------

/** Fetch session lobby data (participants + session info) via RPC */
export async function getSessionLobbyData(
  supabase: Client,
  sessionId: string,
): Promise<SessionLobbyData | null> {
  const { data, error } = await supabase.rpc("get_session_lobby", {
    p_session_id: sessionId,
  });

  if (error || !data) return null;

  const result = data as unknown as {
    session_id: string;
    gym_name: string;
    status: string;
    participants: Array<{
      participant_id: string;
      athlete_id: string;
      display_name: string;
      current_elo: number;
      current_weight: number | null;
      profile_photo_url: string | null;
      primary_gym_id: string | null;
      gym_name: string | null;
      status: string;
      weight_confirmed: number | null;
      current_match_id: string | null;
      checked_in_at: string;
      elo_distance: number;
    }>;
  };

  const participants: LobbyParticipant[] = result.participants.map((p) => ({
    participantId: p.participant_id,
    athleteId: p.athlete_id,
    displayName: p.display_name,
    currentElo: p.current_elo,
    currentWeight: p.current_weight,
    profilePhotoUrl: p.profile_photo_url,
    primaryGymId: p.primary_gym_id,
    gymName: p.gym_name,
    status: p.status,
    weightConfirmed: p.weight_confirmed,
    currentMatchId: p.current_match_id,
    checkedInAt: p.checked_in_at,
    eloDistance: p.elo_distance,
  }));

  return {
    sessionId: result.session_id,
    gymName: result.gym_name,
    status: result.status,
    participants,
  };
}

// ---------------------------------------------------------------------------
// Challenge lobby
// ---------------------------------------------------------------------------

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

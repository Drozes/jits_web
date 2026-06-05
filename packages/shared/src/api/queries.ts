import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { Athlete } from "../types/athlete";
import type {
  EloStakes,
  MatchHistoryRow,
  EloHistoryRow,
  DashboardSummary,
  ArenaData,
} from "../types/composites";
import type { SubmissionType } from "../types/submission-type";
import type {
  GymListItem,
  GymDetail,
  SessionListItem,
  ActiveSessionInfo,
  SessionJoinData,
  SessionLobbyData,
  LobbyParticipant,
  SessionTemplate,
} from "../types/session";
import type { NotificationItem } from "../types/notification";
import type {
  WeeklyActivity,
  SubmissionBreakdown,
  WeightClassStats,
  GymManagerStats,
} from "../types/analytics";
import type {
  GymRosterRow,
  GymAthleteDetail,
  GymStats,
  GymSubmissionStat,
  GymEloBracketStats,
  GymLadderRow,
} from "../types/gym-portal";
import { mapPostgrestError, type DomainError, type Result } from "./errors";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Current athlete (auth-context resolution)
// ---------------------------------------------------------------------------

/**
 * Columns selected when resolving the current athlete from auth context.
 * Both web's `requireAthlete` (and `getActiveAthlete`) in `apps/web/lib/guards.ts`
 * and mobile's `AuthProvider` in `apps/mobile/lib/auth/auth-context.tsx`
 * consume this projection — keep it in sync with `AthleteGuardRow` below.
 *
 * Excludes `created_at`, `push_token`, `role`, `avatar_url`, `default_still_url`,
 * and `is_scoutable` to keep payloads small on every page load.
 */
export const ATHLETE_GUARD_SELECT =
  "id, auth_user_id, display_name, first_name, last_name, current_elo, highest_elo, current_weight, primary_gym_id, profile_photo_url, looking_for_casual, looking_for_ranked, status, free_agent, gender, date_of_birth, city" as const;

/**
 * The subset of the `athletes` row returned by `getCurrentAthlete`.
 * Derived from the canonical `Athlete` type so column types stay aligned
 * with the generated `database.ts`.
 */
export type AthleteGuardRow = Pick<
  Athlete,
  | "id"
  | "auth_user_id"
  | "display_name"
  | "first_name"
  | "last_name"
  | "current_elo"
  | "highest_elo"
  | "current_weight"
  | "primary_gym_id"
  | "profile_photo_url"
  | "looking_for_casual"
  | "looking_for_ranked"
  | "status"
  | "free_agent"
  | "gender"
  | "date_of_birth"
  | "city"
>;

/**
 * Fetches the athlete row associated with the currently authenticated user.
 * Returns `null` when no athlete row exists yet (e.g. fresh signup before
 * the setup wizard has activated the account) or on query error.
 *
 * Uses `.maybeSingle()` so a missing row is non-throwing — callers decide
 * how to handle null (web guards redirect to `/profile/setup`; mobile
 * AuthProvider keeps `athlete = null` until refresh).
 */
export async function getCurrentAthlete(
  supabase: Client,
  authUserId: string,
): Promise<AthleteGuardRow | null> {
  const { data, error } = await supabase
    .from("athletes")
    .select(ATHLETE_GUARD_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    console.error("getCurrentAthlete:", error);
    return null;
  }
  return (data as AthleteGuardRow | null) ?? null;
}

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
  const { data, error } = await supabase.rpc("get_arena_data", { p_limit: limit });
  if (error) console.error("getArenaData:", error);
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
  const { data, error } = await supabase.rpc("get_athlete_stats", {
    p_athlete_id: athleteId,
  });
  if (error) console.error("getAthleteStatsRpc:", error);
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
  const { data, error } = await supabase.rpc("get_athletes_stats", {
    p_athlete_ids: athleteIds,
  });
  if (error) {
    console.error("getAthletesStatsRpc:", error);
    return new Map();
  }
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
  const { data, error } = await supabase.rpc("get_match_history", {
    p_athlete_id: athleteId,
  });
  if (error) {
    console.error("getMatchHistory:", error);
    return [];
  }
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
  const { data, error } = await supabase.rpc("get_elo_history", {
    p_athlete_id: athleteId,
  });
  if (error) {
    console.error("getEloHistory:", error);
    return [];
  }
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
  const { data, error } = await supabase.rpc("calculate_elo_stakes", {
    challenger_elo: challengerElo,
    opponent_elo: opponentElo,
    ...(challengerWeight ? { challenger_weight: challengerWeight } : {}),
    ...(opponentWeight ? { opponent_weight: opponentWeight } : {}),
  });
  if (error) {
    console.error("getEloStakes:", error);
    return null;
  }
  return (data as unknown as EloStakes) ?? null;
}

// ---------------------------------------------------------------------------
// Submission types
// ---------------------------------------------------------------------------

/** Fetch all active submission types, ordered by category then sort_order */
export async function getSubmissionTypes(
  supabase: Client,
): Promise<SubmissionType[]> {
  const { data, error } = await supabase
    .from("submission_types")
    .select("*")
    .eq("status", "active")
    .order("category")
    .order("sort_order");
  if (error) {
    console.error("getSubmissionTypes:", error);
    return [];
  }
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
  const { data, error } = await supabase.rpc("can_create_challenge", {
    p_opponent_id: opponentId,
  });
  if (error) {
    console.error("canCreateChallenge:", error);
    return false;
  }
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
  current_weight: number | null;
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
  challenge_id: string | null;
  session_id: string | null;
  match_type: string;
  duration_seconds: number;
  status: string;
  result: string | null;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  total_paused_duration: number;
  timekeeper_id: string | null;
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
  const { data, error } = await supabase
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

  if (error) {
    console.error("getChallengesBetween:", error);
    return [];
  }
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
  const { data, error } = await supabase
    .from("challenges")
    .select("id")
    .eq("status", "pending")
    .or(
      `and(challenger_id.eq.${athleteA},opponent_id.eq.${athleteB}),and(challenger_id.eq.${athleteB},opponent_id.eq.${athleteA})`,
    )
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getPendingChallengeBetween:", error);
    return null;
  }
  return data ? { id: data.id } : null;
}

/** Get IDs of all athletes who have a pending challenge with this athlete (either direction) */
export async function getPendingChallengeOpponentIds(
  supabase: Client,
  athleteId: string,
): Promise<Set<string>> {
  const [
    { data: sent, error: sentError },
    { data: received, error: receivedError },
  ] = await Promise.all([
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

  if (sentError) console.error("getPendingChallengeOpponentIds (sent):", sentError);
  if (receivedError) console.error("getPendingChallengeOpponentIds (received):", receivedError);

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
  // Fetch gyms, member-count source, and sessions in parallel: the three
  // reads are independent, so serializing them tripled the tab's load latency.
  const [{ data: gyms }, { data: athletes }, { data: sessions }] =
    await Promise.all([
      supabase
        .from("gyms")
        .select("id, name, city, status")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("athletes")
        .select("primary_gym_id")
        .eq("status", "active")
        .not("primary_gym_id", "is", null),
      supabase
        .from("sessions")
        .select("id, gym_id, status, scheduled_start, scheduled_end")
        .in("status", ["active", "scheduled"]),
    ]);

  if (!gyms || gyms.length === 0) return [];

  const memberCountMap = new Map<string, number>();
  for (const a of athletes ?? []) {
    if (a.primary_gym_id) {
      memberCountMap.set(a.primary_gym_id, (memberCountMap.get(a.primary_gym_id) ?? 0) + 1);
    }
  }

  const activeMap = new Map<string, number>();
  const upcomingMap = new Map<string, number>();
  const nextStartMap = new Map<string, string>();
  const now = new Date().toISOString();

  for (const s of sessions ?? []) {
    // A session is "live/joinable" iff status='active' AND scheduled_end is in
    // the future. This matches getGymDetail's filter (.gt("scheduled_end", now))
    // so a gym never shows LIVE on the list while detail shows no sessions. We
    // use the same ISO-string `now` basis the detail query uses to avoid a new
    // inconsistency.
    if (s.status === "active" && s.scheduled_end > now) {
      activeMap.set(s.gym_id, (activeMap.get(s.gym_id) ?? 0) + 1);
    } else if (s.status === "scheduled" && s.scheduled_start > now) {
      upcomingMap.set(s.gym_id, (upcomingMap.get(s.gym_id) ?? 0) + 1);
      const existing = nextStartMap.get(s.gym_id);
      if (!existing || s.scheduled_start < existing) {
        nextStartMap.set(s.gym_id, s.scheduled_start);
      }
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
      nextSessionStart: nextStartMap.get(g.id) ?? null,
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
  const [participantsResult, rsvpsResult, creatorsResult, athleteRsvpsResult, athleteParticipantsResult] =
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
      sessionIds.length > 0
        ? supabase.from("session_participants").select("session_id").eq("athlete_id", athleteId).in("session_id", sessionIds)
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

  // Athlete's participant (checked-in) session IDs
  const participantSessionIds = (athleteParticipantsResult.data ?? []).map(
    (p) => p.session_id,
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
    createdBy: s.created_by,
    createdByName: creatorNameMap.get(s.created_by) ?? "Unknown",
  }));

  // 5. Check membership, manager status, and count members
  const [{ data: athleteRow }, { count: memberCount }, { data: managerRow }] = await Promise.all([
    supabase
      .from("athletes")
      .select("primary_gym_id")
      .eq("id", athleteId)
      .single(),
    supabase
      .from("athletes")
      .select("id", { count: "exact", head: true })
      .eq("primary_gym_id", gymId)
      .eq("status", "active"),
    supabase
      .from("gym_managers")
      .select("id")
      .eq("gym_id", gymId)
      .eq("athlete_id", athleteId)
      .maybeSingle(),
  ]);

  const isMemberGym = athleteRow?.primary_gym_id === gymId;
  const isGymManager = !!managerRow;

  return {
    id: gym.id,
    name: gym.name,
    city: gym.city,
    status: gym.status,
    sessions: sessionListItems,
    rsvpSessionIds,
    participantSessionIds,
    memberCount: memberCount ?? 0,
    isMemberGym,
    isGymManager,
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
    // Check if any of those sessions are active. Order by created_at DESC so
    // the most-recently-created active session wins when an athlete is
    // checked into more than one (e.g., overlapping or stale sessions at the
    // same gym).
    const participantSessionIds = activeParticipants.map((p) => p.session_id);
    const { data: activeSessions } = await supabase
      .from("sessions")
      .select("id, gym_id, status, scheduled_start, scheduled_end, created_at")
      .in("id", participantSessionIds)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);

    if (activeSessions && activeSessions.length > 0) {
      const session = activeSessions[0];
      // Gym-name lookup and participant count both depend only on the resolved
      // session, so run them concurrently instead of serially.
      const [{ data: gymRow }, { count }] = await Promise.all([
        // Get gym name
        supabase
          .from("gyms")
          .select("name")
          .eq("id", session.gym_id)
          .single(),
        // Count participants
        supabase
          .from("session_participants")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id),
      ]);

      return {
        sessionId: session.id,
        gymId: session.gym_id,
        gymName: gymRow?.name ?? "Unknown",
        status: "active",
        scheduledStart: session.scheduled_start,
        scheduledEnd: session.scheduled_end,
        participantCount: count ?? 0,
        isRsvpd: false,
        isCheckedIn: true,
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
      // Gym name, participant count, and the athlete's check-in row all depend
      // only on the resolved session (and athleteId); none feeds another, so
      // run all three concurrently.
      const [{ data: gymRow }, { count }, { data: participantRow }] = await Promise.all([
        supabase
          .from("gyms")
          .select("name")
          .eq("id", session.gym_id)
          .single(),
        supabase
          .from("session_participants")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id),
        // Athletes with an RSVP haven't necessarily checked in; verify via session_participants
        supabase
          .from("session_participants")
          .select("id")
          .eq("session_id", session.id)
          .eq("athlete_id", athleteId)
          .neq("status", "left")
          .maybeSingle(),
      ]);

      return {
        sessionId: session.id,
        gymId: session.gym_id,
        gymName: gymRow?.name ?? "Unknown",
        status: "scheduled",
        scheduledStart: session.scheduled_start,
        scheduledEnd: session.scheduled_end,
        participantCount: count ?? 0,
        isRsvpd: true,
        isCheckedIn: !!participantRow,
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

export type GetSessionLobbyResult =
  | { ok: true; data: SessionLobbyData }
  | { ok: false; error: DomainError };

/**
 * Fetch session lobby data via the `get_session_lobby` RPC. The RPC validates
 * the session exists (raising P0001/session_not_found otherwise) and returns
 * session metadata in a single round trip, so no parallel embed query is
 * needed.
 */
export async function getSessionLobbyData(
  supabase: Client,
  sessionId: string,
): Promise<GetSessionLobbyResult> {
  const { data, error } = await supabase.rpc("get_session_lobby", {
    p_session_id: sessionId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error, "session_lobby") };
  }
  if (!data) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Lobby returned no data.",
      },
    };
  }

  const result = data as unknown as {
    session_id: string;
    session_status: string;
    gym_id: string;
    gym_name: string | null;
    title: string | null;
    scheduled_start: string;
    scheduled_end: string;
    caller_is_participant: boolean;
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
    ok: true,
    data: {
      sessionId: result.session_id,
      gymName: result.gym_name ?? "Unknown Gym",
      status: result.session_status,
      participants,
    },
  };
}

// ---------------------------------------------------------------------------
// Session templates
// ---------------------------------------------------------------------------

/** Fetch session templates for a gym, ordered by day of week then start time */
export async function getSessionTemplates(
  supabase: Client,
  gymId: string,
): Promise<SessionTemplate[]> {
  const { data, error } = await supabase
    .from("session_templates")
    .select("*")
    .eq("gym_id", gymId)
    .order("day_of_week")
    .order("start_time");

  if (error) {
    console.error("getSessionTemplates:", error);
    return [];
  }
  return (data as SessionTemplate[]) ?? [];
}

// ---------------------------------------------------------------------------
// Challenge lobby
// ---------------------------------------------------------------------------

/** Fetch full challenge details for match lobby screen */
export async function getLobbyData(
  supabase: Client,
  challengeId: string,
): Promise<LobbyData | null> {
  const { data, error } = await supabase
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

  if (error) {
    console.error("getLobbyData:", error);
    return null;
  }
  if (!data) return null;

  // Aliased FK joins return single objects (not arrays)
  const challenger = data.challenger as unknown as LobbyData["challenger"];
  const opponent = data.opponent as unknown as LobbyData["opponent"];
  const gym = (data.gym as unknown as LobbyData["gym"]) ?? null;

  return { ...data, challenger, opponent, gym };
}

// ---------------------------------------------------------------------------
// Analytics queries (derived from existing RPCs + tables)
// ---------------------------------------------------------------------------

/** IBJJF-inspired weight division labels (lbs). Each bucket spans ~11 lbs. */
const WEIGHT_DIVISIONS = [
  { label: "Rooster (< 127)", max: 127 },
  { label: "Light Feather (128-141)", max: 141 },
  { label: "Feather (142-154)", max: 154 },
  { label: "Light (155-167)", max: 167 },
  { label: "Middle (168-181)", max: 181 },
  { label: "Medium Heavy (182-195)", max: 195 },
  { label: "Heavy (196-207)", max: 207 },
  { label: "Super Heavy (208-221)", max: 221 },
  { label: "Ultra Heavy (222+)", max: Infinity },
];

function getWeightDivisionLabel(weightLbs: number): string {
  for (const d of WEIGHT_DIVISIONS) {
    if (weightLbs <= d.max) return d.label;
  }
  return WEIGHT_DIVISIONS[WEIGHT_DIVISIONS.length - 1].label;
}

/**
 * Count matches per week for the last 8 weeks.
 * Uses get_match_history and groups client-side by ISO week.
 */
export async function getWeeklyMatchActivity(
  supabase: Client,
  athleteId: string,
): Promise<WeeklyActivity[]> {
  const history = await getMatchHistory(supabase, athleteId);

  const now = new Date();
  const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);

  // Build 8 weekly buckets (Mon-Sun)
  const weeks: WeeklyActivity[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const mon = new Date(weekStart);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const label = `${mon.getMonth() + 1}/${mon.getDate()}`;
    weeks.push({ week: label, matches: 0, wins: 0 });
  }

  for (const m of history) {
    const d = new Date(m.completed_at);
    if (d < eightWeeksAgo) continue;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
    const weekIndex = 7 - Math.floor(diffDays / 7);
    if (weekIndex >= 0 && weekIndex < 8) {
      weeks[weekIndex].matches++;
      if (m.athlete_outcome === "win") weeks[weekIndex].wins++;
    }
  }

  return weeks;
}

/**
 * Count each submission type from match history (wins + losses by submission).
 */
export async function getSubmissionBreakdown(
  supabase: Client,
  athleteId: string,
): Promise<SubmissionBreakdown[]> {
  const history = await getMatchHistory(supabase, athleteId);

  const map = new Map<string, SubmissionBreakdown>();
  for (const m of history) {
    if (m.result !== "submission" || !m.submission_type_display_name) continue;
    const name = m.submission_type_display_name;
    const entry = map.get(name) ?? { type: name, count: 0, asWinner: 0, asLoser: 0 };
    entry.count++;
    if (m.athlete_outcome === "win") entry.asWinner++;
    else entry.asLoser++;
    map.set(name, entry);
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/**
 * Wins/losses/draws grouped by opponent weight class.
 * Looks up current weights for all opponents from match history.
 */
export async function getWeightClassStats(
  supabase: Client,
  athleteId: string,
): Promise<WeightClassStats[]> {
  const history = await getMatchHistory(supabase, athleteId);
  if (history.length === 0) return [];

  // Batch-fetch opponent weights
  const opponentIds = [...new Set(history.map((m) => m.opponent_id))];
  const { data: opponents } = await supabase
    .from("athletes")
    .select("id, current_weight")
    .in("id", opponentIds);

  const weightMap = new Map<string, number>();
  for (const o of opponents ?? []) {
    if (o.current_weight) weightMap.set(o.id, o.current_weight);
  }

  const divisionMap = new Map<string, WeightClassStats>();
  for (const m of history) {
    const weight = weightMap.get(m.opponent_id);
    if (!weight) continue;
    const label = getWeightDivisionLabel(weight);
    const entry = divisionMap.get(label) ?? { division: label, wins: 0, losses: 0, draws: 0 };
    if (m.athlete_outcome === "win") entry.wins++;
    else if (m.athlete_outcome === "loss") entry.losses++;
    else entry.draws++;
    divisionMap.set(label, entry);
  }

  return Array.from(divisionMap.values()).sort((a, b) => {
    const totalB = b.wins + b.losses + b.draws;
    const totalA = a.wins + a.losses + a.draws;
    return totalB - totalA;
  });
}

/**
 * Gym-level aggregate stats for manager dashboards.
 * Builds from existing tables (sessions, session_participants, matches, athletes).
 */
export async function getGymManagerStats(
  supabase: Client,
  gymId: string,
): Promise<GymManagerStats> {
  const [sessionsResult, membersResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id")
      .eq("gym_id", gymId),
    supabase
      .from("athletes")
      .select("id", { count: "exact", head: true })
      .eq("primary_gym_id", gymId)
      .eq("status", "active"),
  ]);

  const sessionIds = (sessionsResult.data ?? []).map((s) => s.id);
  const totalSessions = sessionIds.length;
  const activeMemberCount = membersResult.count ?? 0;

  if (sessionIds.length === 0) {
    return { totalSessions: 0, totalParticipants: 0, totalMatches: 0, activeMemberCount };
  }

  const [participantsResult, matchesResult] = await Promise.all([
    supabase
      .from("session_participants")
      .select("id", { count: "exact", head: true })
      .in("session_id", sessionIds),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("session_id", sessionIds),
  ]);

  return {
    totalSessions,
    totalParticipants: participantsResult.count ?? 0,
    totalMatches: matchesResult.count ?? 0,
    activeMemberCount,
  };
}

// ---------------------------------------------------------------------------
// Gym-owner portal RPCs (epic jits-iwd) — manager-gated reads via SECURITY
// DEFINER functions that bypass match_participants RLS. The four member/stats
// RPCs raise P0001 (HINT 'not_gym_manager' / 'not_member') when the caller is
// not a manager, so they return Result<T> to let mobile slices gate UI on the
// NOT_GYM_MANAGER / NOT_GYM_MEMBER codes. The gym ladder is aggregate-only and
// not gated, so it returns its rows directly.
// ---------------------------------------------------------------------------

/** A p_range window token accepted by the gym stats/ladder RPCs. */
export type GymStatsRange = "30d" | "90d" | "all";

/**
 * Manager-only: active members of a gym ordered by current_elo DESC, with
 * recent ELO delta, last-active, provisional flag, and W/L/D. [jits-iwd.1]
 */
export async function getGymRoster(
  supabase: Client,
  gymId: string,
): Promise<Result<GymRosterRow[]>> {
  const { data, error } = await supabase.rpc("get_gym_roster", {
    p_gym_id: gymId,
  });
  if (error) return { ok: false, error: mapPostgrestError(error) };

  const rows = (data ?? []).map((r) => ({
    athleteId: r.athlete_id,
    displayName: r.display_name,
    currentElo: r.current_elo,
    eloDelta: r.elo_delta,
    lastActive: r.last_active,
    isProvisional: r.is_provisional,
    wins: Number(r.wins),
    losses: Number(r.losses),
    draws: Number(r.draws),
  }));
  return { ok: true, data: rows };
}

/**
 * Manager-only: single member detail (current/peak ELO, W/L/D, win rate,
 * last-10 ELO trend, last-5 matches). [jits-iwd.2]
 */
export async function getGymAthleteDetail(
  supabase: Client,
  gymId: string,
  athleteId: string,
): Promise<Result<GymAthleteDetail>> {
  const { data, error } = await supabase.rpc("get_gym_athlete_detail", {
    p_gym_id: gymId,
    p_athlete_id: athleteId,
  });
  if (error) return { ok: false, error: mapPostgrestError(error) };

  const raw = (data ?? {}) as {
    current_elo?: number;
    peak_elo?: number;
    wins?: number;
    losses?: number;
    draws?: number;
    win_rate?: number;
    elo_trend?: GymAthleteDetail["eloTrend"];
    last_matches?: GymAthleteDetail["lastMatches"];
  };
  return {
    ok: true,
    data: {
      currentElo: raw.current_elo ?? 0,
      peakElo: raw.peak_elo ?? 0,
      wins: raw.wins ?? 0,
      losses: raw.losses ?? 0,
      draws: raw.draws ?? 0,
      winRate: raw.win_rate ?? 0,
      eloTrend: raw.elo_trend ?? [],
      lastMatches: raw.last_matches ?? [],
    },
  };
}

/**
 * Manager-only: gym-wide aggregate dashboard over a 30d/90d/all window (avg
 * ELO, momentum, submission/draw rates, top submissions, finish times, ELO
 * trend). [jits-iwd.3]
 */
export async function getGymStats(
  supabase: Client,
  gymId: string,
  range: GymStatsRange = "90d",
): Promise<Result<GymStats>> {
  const { data, error } = await supabase.rpc("get_gym_stats", {
    p_gym_id: gymId,
    p_range: range,
  });
  if (error) return { ok: false, error: mapPostgrestError(error) };

  // The BE builds each submission row via row_to_json over a subquery that
  // aliases COUNT(*) AS cnt (not count), so remap cnt -> count here rather than
  // passing the raw key through.
  type RawSubmissionStat = { name: string; cnt: number; pct: number };
  const mapSubs = (rows: RawSubmissionStat[] | undefined): GymSubmissionStat[] =>
    (rows ?? []).map((s) => ({ name: s.name, count: Number(s.cnt), pct: s.pct }));

  const raw = (data ?? {}) as {
    avg_elo?: number;
    momentum?: number;
    submission_rate?: number;
    draw_rate?: number;
    avg_elo_on_draw?: number;
    winning_submissions?: RawSubmissionStat[];
    losing_submissions?: RawSubmissionStat[];
    avg_win_time?: number;
    avg_loss_time?: number;
    elo_trend?: GymStats["eloTrend"];
  };
  return {
    ok: true,
    data: {
      avgElo: raw.avg_elo ?? 0,
      momentum: raw.momentum ?? 0,
      submissionRate: raw.submission_rate ?? 0,
      drawRate: raw.draw_rate ?? 0,
      avgEloOnDraw: raw.avg_elo_on_draw ?? 0,
      winningSubmissions: mapSubs(raw.winning_submissions),
      losingSubmissions: mapSubs(raw.losing_submissions),
      avgWinTime: raw.avg_win_time ?? 0,
      avgLossTime: raw.avg_loss_time ?? 0,
      eloTrend: raw.elo_trend ?? [],
    },
  };
}

/**
 * Manager-only: per-ELO-bracket breakdown (1900+/1700-1900/1500-1700/
 * 1300-1500) of counts, rates, momentum, finish times, and top winning/losing
 * submissions. [jits-iwd.4]
 */
export async function getGymStatsByEloRange(
  supabase: Client,
  gymId: string,
  range: GymStatsRange = "90d",
): Promise<Result<GymEloBracketStats[]>> {
  const { data, error } = await supabase.rpc("get_gym_stats_by_elo_range", {
    p_gym_id: gymId,
    p_range: range,
  });
  if (error) return { ok: false, error: mapPostgrestError(error) };

  const raw = (data ?? {}) as {
    brackets?: {
      bracket: string;
      athlete_count: number;
      match_count: number;
      avg_elo: number;
      momentum: number;
      submission_rate: number;
      draw_rate: number;
      avg_win_time: number;
      avg_loss_time: number;
      top_winning_sub: string | null;
      top_losing_sub: string | null;
    }[];
  };
  const brackets = (raw.brackets ?? []).map((b) => ({
    bracket: b.bracket,
    athleteCount: Number(b.athlete_count),
    matchCount: Number(b.match_count),
    avgElo: b.avg_elo,
    momentum: b.momentum,
    submissionRate: b.submission_rate,
    drawRate: b.draw_rate,
    avgWinTime: b.avg_win_time,
    avgLossTime: b.avg_loss_time,
    topWinningSub: b.top_winning_sub,
    topLosingSub: b.top_losing_sub,
  }));
  return { ok: true, data: brackets };
}

/**
 * Aggregate gym ranking by average active-member ELO, optional city filter;
 * returns athlete/match counts and momentum (no per-athlete data, not gated).
 * [jits-iwd.5]
 */
export async function getGymLadder(
  supabase: Client,
  options: { city?: string | null; range?: GymStatsRange } = {},
): Promise<GymLadderRow[]> {
  const { data, error } = await supabase.rpc("get_gym_ladder", {
    ...(options.city ? { p_city: options.city } : {}),
    p_range: options.range ?? "90d",
  });
  if (error) {
    console.error("getGymLadder:", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    gymId: r.gym_id,
    gymName: r.gym_name,
    city: r.city,
    athleteCount: Number(r.athlete_count),
    matchCount: Number(r.match_count),
    avgElo: r.avg_elo,
    // BE returns momentum as round(AVG(member_delta), 1) (one decimal). Round to a
    // whole number here so the ladder row arrow (DeltaNumber) and the "Your Gym"
    // callout (formatMomentum, also Math.round) agree, matching how the stats
    // screen renders momentum. Avoids a fractional ELO-change arrow.
    momentum: Math.round(r.momentum),
  }));
}

/** A gym the current athlete manages (gym-owner portal entry resolution). */
export interface ManagedGym {
  gymId: string;
  name: string;
  city: string | null;
}

/**
 * Gyms the given athlete manages (rows in `gym_managers`), with the gym name +
 * city joined for display. Drives the gym-owner portal entry: the hub uses the
 * first managed gym, and a non-empty list is the gate for showing the Gym
 * Manager tab. Aggregate read style (returns [] on error), since the absence of
 * managed gyms is a normal, non-exceptional state for most athletes.
 */
export async function getManagedGyms(
  supabase: Client,
  athleteId: string,
): Promise<ManagedGym[]> {
  const { data, error } = await supabase
    .from("gym_managers")
    .select("gym_id, gyms!gym_managers_gym_id_fkey(name, city)")
    .eq("athlete_id", athleteId)
    .order("granted_at", { ascending: true });
  if (error) {
    console.error("getManagedGyms:", error);
    return [];
  }
  return (data ?? []).map((r) => {
    // Aliased→T, but the to-one `gyms!fk` join is typed as an array by the
    // generated types; narrow through unknown and read [0] defensively.
    const gym = (r.gyms as unknown as { name: string; city: string | null }[] | { name: string; city: string | null } | null);
    const resolved = Array.isArray(gym) ? gym[0] : gym;
    return {
      gymId: r.gym_id,
      name: resolved?.name ?? "Gym",
      city: resolved?.city ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Notification history (built from challenges + match history, no new table)
// ---------------------------------------------------------------------------

/**
 * Build a unified notification feed from existing tables:
 * 1. Challenges involving the athlete (received: pending/accepted/declined)
 * 2. Completed matches from get_match_history RPC
 *
 * Returns items sorted newest-first, capped at `limit`.
 */
export async function getNotificationHistory(
  supabase: Client,
  athleteId: string,
  limit = 30,
): Promise<NotificationItem[]> {
  const [challengeItems, matchItems] = await Promise.all([
    fetchChallengeNotifications(supabase, athleteId),
    fetchMatchNotifications(supabase, athleteId),
  ]);

  const all = [...challengeItems, ...matchItems];
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return all.slice(0, limit);
}

async function fetchChallengeNotifications(
  supabase: Client,
  athleteId: string,
): Promise<NotificationItem[]> {
  // Received challenges (pending, accepted, declined)
  const { data: received } = await supabase
    .from("challenges")
    .select(
      "id, status, match_type, created_at, updated_at, challenger:athletes!fk_challenges_challenger(display_name)",
    )
    .eq("opponent_id", athleteId)
    .in("status", ["pending", "accepted", "declined"])
    .order("updated_at", { ascending: false })
    .limit(20);

  // Sent challenges that were accepted or declined
  const { data: sent } = await supabase
    .from("challenges")
    .select(
      "id, status, match_type, created_at, updated_at, opponent:athletes!fk_challenges_opponent(display_name)",
    )
    .eq("challenger_id", athleteId)
    .in("status", ["accepted", "declined"])
    .order("updated_at", { ascending: false })
    .limit(20);

  const items: NotificationItem[] = [];

  for (const c of received ?? []) {
    const name = (c.challenger as unknown as { display_name: string } | null)?.display_name ?? "Unknown";
    const typeLabel = c.match_type === "ranked" ? "Ranked" : "Casual";

    if (c.status === "pending") {
      items.push({
        id: `challenge-recv-${c.id}`,
        type: "challenge_received",
        title: "Challenge Received",
        body: `${name} sent you a ${typeLabel.toLowerCase()} challenge`,
        createdAt: c.created_at,
      });
    } else if (c.status === "accepted") {
      items.push({
        id: `challenge-accepted-${c.id}`,
        type: "challenge_accepted",
        title: "Challenge Accepted",
        body: `You accepted ${name}'s ${typeLabel.toLowerCase()} challenge`,
        createdAt: c.updated_at,
      });
    } else if (c.status === "declined") {
      items.push({
        id: `challenge-declined-recv-${c.id}`,
        type: "challenge_declined",
        title: "Challenge Declined",
        body: `You declined ${name}'s ${typeLabel.toLowerCase()} challenge`,
        createdAt: c.updated_at,
      });
    }
  }

  for (const c of sent ?? []) {
    const name = (c.opponent as unknown as { display_name: string } | null)?.display_name ?? "Unknown";
    const typeLabel = c.match_type === "ranked" ? "Ranked" : "Casual";

    if (c.status === "accepted") {
      items.push({
        id: `challenge-sent-accepted-${c.id}`,
        type: "challenge_accepted",
        title: "Challenge Accepted",
        body: `${name} accepted your ${typeLabel.toLowerCase()} challenge`,
        createdAt: c.updated_at,
      });
    } else if (c.status === "declined") {
      items.push({
        id: `challenge-sent-declined-${c.id}`,
        type: "challenge_declined",
        title: "Challenge Declined",
        body: `${name} declined your ${typeLabel.toLowerCase()} challenge`,
        createdAt: c.updated_at,
      });
    }
  }

  return items;
}

async function fetchMatchNotifications(
  supabase: Client,
  athleteId: string,
): Promise<NotificationItem[]> {
  const { data, error } = await supabase.rpc("get_match_history", {
    p_athlete_id: athleteId,
  });

  if (error || !data) return [];

  const rows = data as MatchHistoryRow[];
  return rows.slice(0, 20).map((m) => {
    const outcome = m.athlete_outcome;
    const delta = m.elo_delta;
    const sign = delta >= 0 ? "+" : "";
    let body: string;

    if (outcome === "win") {
      body = `You defeated ${m.opponent_display_name} (${sign}${delta} ELO)`;
    } else if (outcome === "loss") {
      body = `${m.opponent_display_name} defeated you (${sign}${delta} ELO)`;
    } else {
      body = `Draw with ${m.opponent_display_name} (${sign}${delta} ELO)`;
    }

    return {
      id: `match-${m.match_id}`,
      type: "match_result" as const,
      title: outcome === "win" ? "Match Won" : outcome === "loss" ? "Match Lost" : "Match Draw",
      body,
      route: `/session/${m.match_id}`,
      createdAt: m.completed_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Admin board (internal founder Kanban, backs web /design/board)
// ---------------------------------------------------------------------------

export type AdminCardStatus = "todo" | "doing" | "done";

export interface AdminCard {
  id: string;
  title: string;
  notes: string | null;
  status: AdminCardStatus;
  created_at: string;
  updated_at: string;
}

/** Fetch every internal Kanban card, oldest first. */
export async function getAdminCards(supabase: Client): Promise<AdminCard[]> {
  const { data, error } = await supabase
    .from("admin_cards")
    .select("id, title, notes, status, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as AdminCard[];
}

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { Athlete } from "../types/athlete";
import type {
  EloStakes,
  MatchHistoryRow,
  EloHistoryRow,
  DashboardSummary,
  ArenaData,
  PendingChallenge,
  PendingChallengesForAthlete,
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
import {
  videoPlayability,
  videoAngleLabel,
  sortMatchVideosForViewer,
  type VideoPlayability,
} from "../utils/match-video";

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
 * Includes `platform_role` and `is_bot` so the apps can gate admin tooling on
 * every load. Excludes `created_at`, `push_token`, `role`, `avatar_url`,
 * `default_still_url`, and `is_scoutable` to keep payloads small.
 */
export const ATHLETE_GUARD_SELECT =
  "id, auth_user_id, display_name, first_name, last_name, current_elo, highest_elo, current_weight, primary_gym_id, profile_photo_url, looking_for_casual, looking_for_ranked, status, free_agent, gender, date_of_birth, city, platform_role, is_bot" as const;

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
  | "platform_role"
  | "is_bot"
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

/**
 * Everything `getArenaData` and `getArenaDataResult` share.
 *
 * `raw` is the RPC payload EXACTLY as PostgREST handed it over, including the
 * `null` it becomes on failure; `error` is the separate verdict. Keeping the
 * two apart is the whole point: the lenient wrapper has to keep returning that
 * raw value (mobile reads the null as "failed read"), while the Result wrapper
 * has to refuse it.
 *
 * NOTHING HERE CAN REJECT, so failure is derived from `error` and never from a
 * rejection: postgrest-js sets `shouldThrowOnError = false` by default
 * (PostgrestBuilder.ts:82) and its outer handler turns even a hard network
 * failure into a RESOLVED `{ data: null, error }`.
 *
 * `get_arena_data` also RAISEs when `auth_athlete_id()` resolves to nothing, so
 * an authenticated-but-not-yet-an-athlete session reaches this as a P0001, not
 * as an empty lobby.
 */
async function loadArenaData(
  supabase: Client,
  limit: number,
): Promise<{ raw: ArenaData | null; error: DomainError | null }> {
  const { data, error } = await supabase.rpc("get_arena_data", { p_limit: limit });
  // Logged on both paths, unchanged: the lenient caller has nothing else to go
  // on, and the Result caller still wants the PostgREST detail in the server log.
  if (error) console.error("getArenaData:", error);
  return {
    raw: (data as unknown as ArenaData | null) ?? null,
    error: error ? mapPostgrestError(error, "arena_data") : null,
  };
}

/**
 * Fetch all arena page data in a single RPC (athletes, challenges, activity).
 *
 * LENIENT, AND UNCHANGED ON PURPOSE, INCLUDING THE LIE IN ITS RETURN TYPE: it
 * is annotated `Promise<ArenaData>` but resolves to `null` whenever the RPC
 * failed. `apps/mobile/lib/arena/use-arena-roster.ts` depends on exactly that
 * (it re-widens to `ArenaData | null` and treats null as "failed read, do not
 * claim the lobby is empty"), so tightening this would delete mobile's only
 * failure signal. New callers want `getArenaDataResult` instead.
 */
export async function getArenaData(
  supabase: Client,
  limit = 20,
): Promise<ArenaData> {
  const { raw } = await loadArenaData(supabase, limit);
  return raw as ArenaData;
}

/**
 * `getArenaData` with the failure signal it never had.
 *
 * `{ ok: true, data }` means the lobby really is what the payload says, empty
 * included; `{ ok: false }` means the read failed and the caller knows nothing
 * about who is looking for a match.
 *
 * It also rejects a payload whose `looking_athletes` is not an array. Web's
 * `/arena` calls `.map()` on that field straight away, so a malformed or null
 * payload is a TypeError on a primary nav tab rather than a bad render, and
 * "shaped wrong" is not meaningfully different from "did not load" to the
 * surface that has to draw something.
 *
 * Strictly additive: the legacy function above is untouched.
 */
export async function getArenaDataResult(
  supabase: Client,
  limit = 20,
): Promise<Result<ArenaData>> {
  const { raw, error } = await loadArenaData(supabase, limit);
  if (error) return { ok: false, error };
  if (!raw || !Array.isArray(raw.looking_athletes)) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "The arena returned no data." },
    };
  }
  return { ok: true, data: raw };
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

/**
 * Athlete ids that have positively confirmed a match's recorded result.
 *
 * `record_match_result` already flips `matches.status` to `completed` (and
 * applies ELO), so `completed` does NOT mean "both athletes confirmed"; the
 * confirmations live only in `match_confirmations`. RLS lets a participant
 * read every confirmation row of their own matches. Returns null on any
 * failure so callers can tell "nobody confirmed" from "unknown".
 */
export async function getMatchConfirmations(
  supabase: Client,
  matchId: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("match_confirmations")
    .select("athlete_id")
    .eq("match_id", matchId)
    .eq("confirmed", true);

  if (error || !data) return null;
  return (data as { athlete_id: string }[]).map((r) => r.athlete_id);
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

/**
 * One challenge's current status, read fresh.
 *
 * For a client that may have missed the realtime UPDATE (suspended app, a
 * socket that dropped) and needs the truth before acting: the Arena waiting
 * plate re-reads its challenge on foreground and on (re)subscribe. RLS
 * (`challenges_select_own`) only shows rows the caller is a party to, so
 * `data: null` means "not visible", never an error.
 */
export async function getChallengeStatus(
  supabase: Client,
  challengeId: string,
): Promise<Result<{ status: string; expiresAt: string | null } | null>> {
  const { data, error } = await supabase
    .from("challenges")
    .select("status, expires_at")
    .eq("id", challengeId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }
  if (!data) return { ok: true, data: null };
  return {
    ok: true,
    data: { status: data.status, expiresAt: data.expires_at ?? null },
  };
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

/**
 * Columns + aliased FK joins behind `getPendingChallengesForAthlete`.
 *
 * BOTH joins are ALIASED (`challenger:` / `opponent:`), which is what makes
 * PostgREST embed them as a single object rather than an array (see the FK
 * join-shape rules in CLAUDE.md). `challenges` has two FKs onto `athletes`, so
 * the constraint names are mandatory to disambiguate them.
 */
const PENDING_CHALLENGE_SELECT = `id, challenger_id, opponent_id, match_type, created_at, expires_at, challenger_weight, opponent_weight,
  challenger:athletes!fk_challenges_challenger(display_name),
  opponent:athletes!fk_challenges_opponent(display_name)` as const;

/**
 * Read a display name off an aliased FK embed.
 *
 * The embed is a single object at runtime, but the generated types have been
 * known to widen a to-one embed to an array, and PostgREST hands back `null`
 * when RLS hides the referenced row. Both shapes and the null collapse here so
 * neither consumer has to repeat the narrowing.
 */
function embeddedDisplayName(embed: unknown): string {
  const value = Array.isArray(embed) ? embed[0] : embed;
  const name = (value as { display_name?: string } | null | undefined)?.display_name;
  return name ?? "Unknown";
}

/**
 * Every live challenge involving the athlete, split into `incoming` (they are
 * the opponent) and `outgoing` (they are the challenger), newest first.
 *
 * "Live" means `status = 'pending'` AND `expires_at` is still in the future.
 * The expiry filter is applied in the query rather than after the fact because
 * the BE leaves a lapsed challenge sitting at `pending` until a sweep updates
 * it, so status alone would show an athlete an inbox row they can no longer
 * accept.
 *
 * ONE READ, NOT TWO. A single `.or(challenger_id.eq.X, opponent_id.eq.X)`
 * fetches both directions in one round trip and, more importantly, gives one
 * failure verdict: two reads could half-fail and leave the caller rendering an
 * empty outbox next to a populated inbox, with no way to tell which half was
 * real.
 *
 * RLS: `challenges_select_own` (jr_be
 * `20260204034400_create_challenges_table.sql`) is
 * `USING (challenger_id = auth_athlete_id() OR opponent_id = auth_athlete_id())`
 * for role `authenticated`, and no later migration replaces it. So this query
 * returns rows for the CALLER and nobody else: passing another athlete's id
 * yields an empty list, not a leak, and not an error either, which is why the
 * caller must pass the current athlete's own id for the result to mean
 * anything.
 *
 * Returns `Result` (never throws): `{ ok: true, data: { incoming: [], outgoing: [] } }`
 * is the fact "no live challenges", while `{ ok: false }` is "we could not find
 * out": the distinction the inbox has to render differently.
 */
export async function getPendingChallengesForAthlete(
  supabase: Client,
  athleteId: string,
): Promise<Result<PendingChallengesForAthlete>> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("challenges")
    .select(PENDING_CHALLENGE_SELECT)
    .eq("status", "pending")
    .gt("expires_at", now)
    .or(`challenger_id.eq.${athleteId},opponent_id.eq.${athleteId}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getPendingChallengesForAthlete:", error);
    return { ok: false, error: mapPostgrestError(error, "challenges_pending") };
  }

  const incoming: PendingChallenge[] = [];
  const outgoing: PendingChallenge[] = [];

  for (const row of data ?? []) {
    const challenge: PendingChallenge = {
      challengeId: row.id,
      challengerId: row.challenger_id,
      opponentId: row.opponent_id,
      challengerName: embeddedDisplayName(row.challenger),
      opponentName: embeddedDisplayName(row.opponent),
      matchType: row.match_type,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      challengerWeight: row.challenger_weight,
      opponentWeight: row.opponent_weight,
    };
    // Direction is decided by the athlete's ROLE on the row, and the two are
    // mutually exclusive: `challenges_insert` enforces
    // `challenger_id != opponent_id`, so no row can land in both buckets.
    if (row.opponent_id === athleteId) incoming.push(challenge);
    else if (row.challenger_id === athleteId) outgoing.push(challenge);
  }

  return { ok: true, data: { incoming, outgoing } };
}

// ---------------------------------------------------------------------------
// Sessions & Gyms
// ---------------------------------------------------------------------------

/**
 * Everything `getGymsWithSessions` and `getGymsWithSessionsResult` share.
 *
 * It returns the rows it managed to build AND the first fatal error, so the two
 * public wrappers can differ in policy without differing in behaviour: the
 * legacy wrapper keeps handing back whatever it built (which is what web
 * `/gyms` has always rendered), while the Result wrapper refuses to pass a
 * failed read off as data.
 *
 * NOTHING HERE CAN REJECT, so failure is derived from `error` and never from a
 * rejection: postgrest-js sets `shouldThrowOnError = false` by default
 * (PostgrestBuilder.ts:82) and its outer handler turns even a hard network
 * failure into a RESOLVED `{ data: null, error }`. A `.catch` around any of
 * these reads would be dead code, and a test that mocked a rejection would be
 * certifying a path production cannot produce.
 */
async function loadGymsWithSessions(supabase: Client): Promise<{
  items: GymListItem[];
  error: DomainError | null;
}> {
  // Fetch gyms, member counts, and sessions in parallel: the three reads are
  // independent, so serializing them tripled the tab's load latency.
  const [gymsResult, memberCountsResult, sessionsResult] = await Promise.all([
    supabase
      .from("gyms")
      .select("id, name, city, status")
      .eq("status", "active")
      .order("name"),
    // Pre-aggregated server side: one row per gym that has members, rather than
    // one row per active athlete. The client-side version of this map shipped
    // the entire active-athlete table to the device, on the Home landing screen
    // for every athlete without a primary gym (jits-icei.2; RPC is jr_be-p33).
    supabase.rpc("get_gym_member_counts"),
    supabase
      .from("sessions")
      .select("id, gym_id, status, scheduled_start, scheduled_end")
      .in("status", ["active", "scheduled"]),
  ]);

  // FATAL: without gyms there is no list at all, and without sessions the list
  // would quietly report every gym as dark. Both are claims the surface acts on.
  const fatal: DomainError | null = gymsResult.error
    ? mapPostgrestError(gymsResult.error, "gyms_list")
    : sessionsResult.error
      ? mapPostgrestError(sessionsResult.error, "gyms_list")
      : null;

  // NOT FATAL: the member count is a subtitle on a gym card, and it is the one
  // read here that can fail for a deployment reason (the RPC ships in a jr_be
  // migration, so a frontend that reaches production first sees PGRST202 until
  // the backend catches up). Degrade the counts to 0 and log it, rather than
  // blanking a list of live gyms over a decorative number.
  if (memberCountsResult.error) {
    console.error(
      "getGymsWithSessions (member counts):",
      memberCountsResult.error,
    );
  }

  const gyms = gymsResult.data;
  if (!gyms || gyms.length === 0) return { items: [], error: fatal };

  const memberCountMap = new Map<string, number>();
  for (const row of memberCountsResult.data ?? []) {
    memberCountMap.set(row.gym_id, Number(row.member_count));
  }

  const activeMap = new Map<string, number>();
  const upcomingMap = new Map<string, number>();
  const nextStartMap = new Map<string, string>();
  const now = new Date().toISOString();

  for (const s of sessionsResult.data ?? []) {
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

  // Build GymListItem array, sort by active sessions first then name
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

  return { items, error: fatal };
}

/**
 * Fetch all active gyms with session counts and member counts.
 *
 * LENIENT, AND UNCHANGED ON PURPOSE: it returns whatever it could build and
 * never reports failure, which is exactly what web `/gyms` has rendered since
 * it shipped. Callers that have to tell an empty list from a failed read want
 * `getGymsWithSessionsResult` instead (jits-icei.5).
 */
export async function getGymsWithSessions(
  supabase: Client,
): Promise<GymListItem[]> {
  return (await loadGymsWithSessions(supabase)).items;
}

/**
 * `getGymsWithSessions` with the failure signal it never had (jits-icei.5).
 *
 * `{ ok: false }` means the read failed and the caller knows nothing about what
 * is on anywhere; `{ ok: true, data: [] }` means no gym currently has a live
 * session, which is a fact the surface may state. Strictly additive: the legacy
 * function above keeps its exact behaviour for existing callers.
 */
export async function getGymsWithSessionsResult(
  supabase: Client,
): Promise<Result<GymListItem[]>> {
  const { items, error } = await loadGymsWithSessions(supabase);
  return error ? { ok: false, error } : { ok: true, data: items };
}

/**
 * A gym payload salvaged from a FAILED read, for display only.
 *
 * `isMemberGym` and `isGymManager` are typed out on purpose. Both default to
 * false when their read fails, and false is indistinguishable from a real
 * answer, so a caller reading an authorization decision off a failed read would
 * silently demote a manager. That is the same defect class this issue is about,
 * so the compiler refuses it rather than a comment asking nicely. `memberCount`
 * stays because it is degraded identically on the success path and is
 * decorative either way.
 */
export type PartialGymDetail = Omit<
  GymDetail,
  "isMemberGym" | "isGymManager"
>;

/**
 * `Result<GymDetail>`, with the salvaged payload attached to the failure
 * branch. Assignable to `Result<GymDetail>`, so a caller that only cares about
 * ok/data/error can ignore `partial` entirely.
 */
export type GymDetailResult =
  | { ok: true; data: GymDetail }
  | { ok: false; error: DomainError; partial: PartialGymDetail | null };

/**
 * Everything `getGymDetail` and `getGymDetailResult` share: it builds the
 * payload AND reports the first fatal error, so the two public wrappers differ
 * only in policy. The legacy wrapper returns the payload exactly as it always
 * did; the Result wrapper refuses to hand over a payload a failed read has
 * quietly hollowed out.
 *
 * NOTHING HERE CAN REJECT, so every verdict is derived from `error` and never
 * from a rejection: postgrest-js sets `shouldThrowOnError = false` by default
 * (PostgrestBuilder.ts:82) and its outer handler turns even a hard network
 * failure into a RESOLVED `{ data: null, error }`. That is exactly why this
 * function used to be dangerous: it destructured `data` and dropped `error`, so
 * a dropped connection, an RLS denial, an expired JWT and a PostgREST 5xx all
 * arrived at the caller as a gym with no sessions (jits-icei.5).
 *
 * FATAL vs DEGRADED. Ten reads across three waves back one payload and they do
 * not carry equal weight, so they are sorted:
 *
 *   FATAL (the Result refuses the payload): the gym row, the session list, and
 *   the two capability booleans, isMemberGym and isGymManager. A failure in any
 *   of these lets the surface state something false that the athlete then acts
 *   on: "nothing is scheduled at your gym", or "you do not manage this gym".
 *
 *   DEGRADED (logged, defaulted, payload still returned): per-session
 *   participant and RSVP counts, creator display names, the athlete's own
 *   rsvp/checked-in id lists, and the member count. These are decorative or
 *   self-correcting on the next read, and promoting them to fatal would hide a
 *   LIVE session behind an error plate, which is the same harm this issue
 *   exists to prevent, reached by a different route.
 */
async function loadGymDetail(
  supabase: Client,
  gymId: string,
  athleteId: string,
): Promise<{
  detail: GymDetail | null;
  error: DomainError | null;
  partial: PartialGymDetail | null;
}> {
  // Logged rather than swallowed: a degraded read is not worth failing the
  // screen over, but it should never be invisible either.
  const logDegraded = (label: string, error: PostgrestError | null) => {
    if (error) console.error(`getGymDetail (${label}):`, error);
  };

  // 1. Fetch gym
  const { data: gym, error: gymError } = await supabase
    .from("gyms")
    .select("id, name, city, status")
    .eq("id", gymId)
    .single();

  // `.single()` reports "no rows" as PGRST116 rather than as a null row, so the
  // two cases separate cleanly: a gym that does not exist is a fact the caller
  // may state, a read that failed is not. Both still yield no detail, which is
  // what this function has always returned and what its callers handle.
  if (gymError) {
    return {
      detail: null,
      partial: null,
      error:
        gymError.code === "PGRST116"
          ? {
              code: "GYM_NOT_FOUND",
              message: "That gym could not be found.",
              raw: gymError,
            }
          : mapPostgrestError(gymError, "gym_detail"),
    };
  }
  if (!gym) {
    return {
      detail: null,
      partial: null,
      error: { code: "GYM_NOT_FOUND", message: "That gym could not be found." },
    };
  }

  // 2. Fetch current/upcoming sessions for this gym
  const now = new Date().toISOString();
  const { data: sessions, error: sessionsError } = await supabase
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
        : Promise.resolve({ data: [] as { session_id: string }[], error: null }),
      sessionIds.length > 0
        ? supabase.from("session_rsvps").select("session_id").in("session_id", sessionIds)
        : Promise.resolve({ data: [] as { session_id: string }[], error: null }),
      sessionIds.length > 0
        ? supabase
            .from("athletes")
            .select("id, display_name")
            .in("id", (sessions ?? []).map((s) => s.created_by))
        : Promise.resolve({ data: [] as { id: string; display_name: string }[], error: null }),
      sessionIds.length > 0
        ? supabase.from("session_rsvps").select("session_id").eq("athlete_id", athleteId).in("session_id", sessionIds)
        : Promise.resolve({ data: [] as { session_id: string }[], error: null }),
      sessionIds.length > 0
        ? supabase.from("session_participants").select("session_id").eq("athlete_id", athleteId).in("session_id", sessionIds)
        : Promise.resolve({ data: [] as { session_id: string }[], error: null }),
    ]);

  logDegraded("participants", participantsResult.error);
  logDegraded("rsvps", rsvpsResult.error);
  logDegraded("creators", creatorsResult.error);
  logDegraded("own rsvps", athleteRsvpsResult.error);
  logDegraded("own participation", athleteParticipantsResult.error);

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
  const [athleteRowResult, memberCountResult, managerRowResult] = await Promise.all([
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

  logDegraded("member count", memberCountResult.error);

  const isMemberGym = athleteRowResult.data?.primary_gym_id === gymId;
  // `.maybeSingle()` means a non-manager is data null with NO error, so only a
  // genuine failure lands in managerRowResult.error. Without that distinction a
  // dropped request silently demotes a manager.
  const isGymManager = !!managerRowResult.data;

  const fatal: DomainError | null = sessionsError
    ? mapPostgrestError(sessionsError, "gym_detail")
    : athleteRowResult.error
      ? mapPostgrestError(athleteRowResult.error, "gym_detail")
      : managerRowResult.error
        ? mapPostgrestError(managerRowResult.error, "gym_detail")
        : null;

  const detail: GymDetail = {
    id: gym.id,
    name: gym.name,
    city: gym.city,
    status: gym.status,
    sessions: sessionListItems,
    rsvpSessionIds,
    participantSessionIds,
    memberCount: memberCountResult.count ?? 0,
    isMemberGym,
    isGymManager,
  };

  return {
    detail,
    error: fatal,
    // The payload is offered back to a Result caller even on a fatal error, but
    // ONLY while the session list itself is trustworthy. A failed capability
    // read (the athlete row, the manager row) says nothing about which sessions
    // exist, so hiding a live session over it would be the very harm this
    // function is being fixed for. A failed SESSIONS read is different: the
    // empty list below is an artefact of the failure, not an answer, so there
    // is nothing safe to offer and the caller gets null.
    partial: sessionsError ? null : detail,
  };
}

/**
 * Fetch gym detail with sessions, RSVP info, and membership check.
 *
 * LENIENT, AND UNCHANGED ON PURPOSE: null still means only "the gym row could
 * not be read", and a failure in any later read still yields a payload with the
 * affected parts defaulted, exactly as before. Web's three call sites turn null
 * into `notFound()`, so tightening this would convert a dropped request into a
 * 404. Callers that must tell "no sessions" from "could not read sessions" want
 * `getGymDetailResult` instead (jits-icei.5).
 */
export async function getGymDetail(
  supabase: Client,
  gymId: string,
  athleteId: string,
): Promise<GymDetail | null> {
  return (await loadGymDetail(supabase, gymId, athleteId)).detail;
}

/**
 * `getGymDetail` with the failure signal it never had (jits-icei.5).
 *
 * `{ ok: true, data }` means the payload is trustworthy on the things a surface
 * states out loud: which sessions exist, and what the athlete may do here.
 * `{ ok: false }` means at least one of those is unknown, and GYM_NOT_FOUND
 * separates a gym that genuinely does not exist from a read that failed.
 *
 * ON FAILURE IT STILL HANDS BACK WHAT IT KNOWS, in `partial`. Refusing the
 * whole payload turned out to be an availability regression on the one surface
 * this issue exists to fix: nine reads succeeding (including a LIVE session at
 * the athlete's gym) and a single `gym_managers` read failing would hide that
 * session behind an error plate, while the old lenient function rendered it.
 * So the failure branch carries the session list whenever the session list is
 * trustworthy, and the caller decides. `partial` is null when it is not, and
 * the capability booleans are typed out of it (see PartialGymDetail) so nobody
 * can read an authorization answer off a failed read.
 *
 * Strictly additive: the legacy function above is untouched, and this type is
 * assignable to `Result<GymDetail>` for a caller that only wants ok/data/error.
 */
export async function getGymDetailResult(
  supabase: Client,
  gymId: string,
  athleteId: string,
): Promise<GymDetailResult> {
  const { detail, error, partial } = await loadGymDetail(
    supabase,
    gymId,
    athleteId,
  );
  if (error) return { ok: false, error, partial };
  if (!detail) {
    return {
      ok: false,
      partial: null,
      error: { code: "GYM_NOT_FOUND", message: "That gym could not be found." },
    };
  }
  return { ok: true, data: detail };
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

// ---------------------------------------------------------------------------
// Platform admin tooling (admin-tooling alpha) — admin/founder-gated RPCs and
// the feature_flags table. The metrics and athlete-search RPCs are admin-gated
// (raise P0001 HINT 'not_admin' for non-admins) as a server-side backstop;
// feature_flags is readable by any authenticated athlete (only the SETTER needs
// the founder/admin RPC).
// ---------------------------------------------------------------------------

/** Platform-wide counters returned by the `get_admin_metrics` RPC (all integers). */
export interface AdminMetrics {
  signups_today: number;
  signups_7d: number;
  athletes_total: number;
  athletes_pending: number;
  athletes_active: number;
  matches_today: number;
  matches_7d: number;
  sessions_upcoming: number;
}

/**
 * Admin-only: platform-wide counters in a single RPC. Returns `Result` so the
 * mobile screen can surface a retryable error on failure. The screen redirects
 * non-admins before it ever renders, so the RPC's `not_admin` HINT is a
 * defense-in-depth backstop rather than a message users normally see.
 */
export async function getAdminMetrics(
  supabase: Client,
): Promise<Result<AdminMetrics>> {
  const { data, error } = await supabase.rpc("get_admin_metrics");
  if (error) return { ok: false, error: mapPostgrestError(error) };
  // RPC `Returns: Json`; narrow to AdminMetrics (8 integer keys).
  return { ok: true, data: data as unknown as AdminMetrics };
}

/** A feature flag row as surfaced to the admin flags screen. */
export interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
}

/**
 * List all feature flags ordered by key. Any authenticated athlete can SELECT
 * this table; the route guard restricts who reaches the screen. Aggregate read
 * style (returns [] on error) since an empty/failed read is non-exceptional.
 */
export async function listFeatureFlags(
  supabase: Client,
): Promise<FeatureFlagRow[]> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, enabled, description")
    .order("key");

  if (error) {
    console.error("listFeatureFlags:", error);
    return [];
  }
  return (data as FeatureFlagRow[]) ?? [];
}

/** A row returned by the admin role-management athlete search. */
export interface AthleteSearchResult {
  id: string;
  display_name: string;
  platform_role: Database["public"]["Enums"]["platform_role"];
}

/**
 * Search athletes by display name for the admin roles screen. Routed through
 * the `admin_search_athletes` RPC (SECURITY DEFINER), which enforces the admin
 * gate, filters out bots, and caps results server-side, so `platform_role` is
 * never leaked to a non-admin and the raw `athletes` SELECT is avoided. Returns
 * `{ id, display_name, platform_role }`. Aggregate read style (returns [] on
 * empty query, or on error — e.g. a non-admin somehow reaching this call).
 */
export async function searchAthletes(
  supabase: Client,
  query: string,
): Promise<AthleteSearchResult[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  const { data, error } = await supabase.rpc("admin_search_athletes", {
    p_query: q,
  });

  if (error) {
    console.error("searchAthletes:", error);
    return [];
  }
  return (data as AthleteSearchResult[]) ?? [];
}

// ---------------------------------------------------------------------------
// Admin member management (admin-tooling alpha) — is_admin()-gated RPCs.
// ---------------------------------------------------------------------------

/** A row in the admin full-member roster (admin_list_athletes). */
export interface AdminAthlete {
  id: string;
  display_name: string;
  platform_role: Database["public"]["Enums"]["platform_role"];
  primary_gym_id: string | null;
  primary_gym_name: string | null;
}

/**
 * Admin-only: the full non-bot member roster for the admin Members picker.
 * Routed through `admin_list_athletes` (SECURITY DEFINER, is_admin()-gated) so
 * the client can load every member once and filter locally (mirrors the
 * gym/city autocomplete). Aggregate read style (returns [] on error — e.g. a
 * non-admin who deep-linked past the route guard).
 */
export async function adminListAthletes(
  supabase: Client,
): Promise<AdminAthlete[]> {
  const { data, error } = await supabase.rpc("admin_list_athletes");
  if (error) {
    console.error("adminListAthletes:", error);
    return [];
  }
  return (data as AdminAthlete[]) ?? [];
}

/** A gym an athlete manages (admin_list_managed_gyms). */
export interface AdminManagedGym {
  gym_id: string;
  gym_name: string;
  city: string | null;
  granted_at: string;
}

/**
 * Admin-only: the gyms an athlete is a manager (gym owner) of, for the admin
 * member-detail view. Routed through `admin_list_managed_gyms` (SECURITY
 * DEFINER, is_admin()-gated). Aggregate read style (returns [] on error).
 */
export async function adminListManagedGyms(
  supabase: Client,
  athleteId: string,
): Promise<AdminManagedGym[]> {
  const { data, error } = await supabase.rpc("admin_list_managed_gyms", {
    p_athlete_id: athleteId,
  });
  if (error) {
    console.error("adminListManagedGyms:", error);
    return [];
  }
  return (data as AdminManagedGym[]) ?? [];
}

/** A gym option for the admin gym-owner picker. */
export interface GymOption {
  id: string;
  name: string;
  city: string | null;
}

/**
 * All gyms (id, name, city) ordered by name, for the admin gym-owner picker.
 * `gyms` is public-readable, so a plain SELECT is fine here. Aggregate read
 * style (returns [] on error).
 */
export async function getAllGyms(supabase: Client): Promise<GymOption[]> {
  const { data, error } = await supabase
    .from("gyms")
    .select("id, name, city")
    .order("name");
  if (error) {
    console.error("getAllGyms:", error);
    return [];
  }
  return (data as GymOption[]) ?? [];
}

// ---------------------------------------------------------------------------
// Match videos (athlete gallery + playback)
// ---------------------------------------------------------------------------

/** Private storage bucket holding match recordings (BE contract §1.2). */
const MATCH_VIDEO_BUCKET = "match-videos";

/** One entry of the `get_athlete_videos` RPC payload. */
export interface AthleteVideoRow {
  video_id: string;
  match_id: string;
  opponent_name: string | null;
  opponent_id: string | null;
  match_date: string | null;
  /** The listed athlete's outcome in that match: "win" | "loss" | "draw". */
  match_result: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  camera_angle: string | null;
  has_analysis: boolean;
  technique_summary: { technique_name: string; count: number }[];
}

/**
 * Video history for an athlete via the `get_athlete_videos` RPC
 * (SECURITY DEFINER: own videos always; other athletes gated on
 * `is_scoutable`, returning [] when private). Only completed matches with
 * non-deleted/failed videos come back, newest first. The RPC's `p_limit`
 * defaults to 10 server-side and is not in the generated types, so it is
 * intentionally not passed here.
 */
export async function getAthleteVideos(
  supabase: Client,
  athleteId: string,
): Promise<AthleteVideoRow[]> {
  const { data, error } = await supabase.rpc("get_athlete_videos", {
    p_athlete_id: athleteId,
  });
  if (error) {
    console.error("getAthleteVideos:", error);
    return [];
  }
  return (data as unknown as AthleteVideoRow[]) ?? [];
}

/**
 * Everything `getMatchVideoSignedUrl` and `getMatchVideoSignedUrlResult` share.
 *
 * Two steps because the RPC payload above omits `storage_path`: read it off
 * `match_videos` (participant-gated RLS), then sign it against the private
 * bucket (storage RLS re-checks participance on sign).
 *
 * ABSENCE AND FAILURE ARE DIFFERENT THINGS HERE, which is the whole point of
 * splitting this out. A missing row or a missing path means there is no
 * recording to play and nothing went wrong; a failed read or a failed signing
 * means we do not know whether there is one. Collapsing both to null is what
 * made a transient PostgREST failure render as "Video Unavailable", telling an
 * athlete their match video does not exist (jits-icei.5).
 */
async function loadMatchVideoSignedUrl(
  supabase: Client,
  videoId: string,
  expiresInSeconds: number,
): Promise<{ url: string | null; error: DomainError | null }> {
  const { data, error } = await supabase
    .from("match_videos")
    .select("storage_path, normalized_path")
    .eq("id", videoId)
    .maybeSingle();
  if (error) {
    console.error("getMatchVideoSignedUrl:", error);
    return { url: null, error: mapPostgrestError(error, "match_video_playback") };
  }
  // Prefer the normalized H.264/AAC MP4 when the slicer wrote one. It only
  // exists for webm-family uploads, which iOS Safari and expo-video cannot
  // play at all; MP4 uploads never have one and keep signing the original.
  const playbackPath = data?.normalized_path ?? data?.storage_path;
  // No row (deleted, or hidden from a non-participant by RLS) and no path are
  // both genuine absence: there is nothing to sign, and the read succeeded.
  if (!playbackPath) return { url: null, error: null };

  const { data: signed, error: signError } = await supabase.storage
    .from(MATCH_VIDEO_BUCKET)
    .createSignedUrl(playbackPath, expiresInSeconds);
  if (signError) {
    console.error("getMatchVideoSignedUrl sign:", signError);
    return {
      url: null,
      error: { code: "UNKNOWN", message: signError.message },
    };
  }
  if (!signed?.signedUrl) {
    // A path that exists but cannot be signed is a failure, not an absence:
    // storage answered without an error and without a URL.
    return {
      url: null,
      error: { code: "UNKNOWN", message: "Storage returned no signed URL." },
    };
  }
  return { url: signed.signedUrl, error: null };
}

/**
 * Resolve a short-lived signed playback URL for one match video. Returns null
 * when the row is invisible (RLS), the path is missing, or signing fails.
 *
 * LENIENT, AND UNCHANGED ON PURPOSE. New callers should prefer
 * `getMatchVideoSignedUrlResult`, which can tell "there is no recording" from
 * "we could not find out".
 */
export async function getMatchVideoSignedUrl(
  supabase: Client,
  videoId: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  return (await loadMatchVideoSignedUrl(supabase, videoId, expiresInSeconds))
    .url;
}

/**
 * `getMatchVideoSignedUrl` with the failure signal it never had (jits-icei.5).
 *
 *   { ok: true, data: string } playable, here is the URL
 *   { ok: true, data: null }   the read worked and there is no recording
 *   { ok: false, error }       the read or the signing failed, we know nothing
 *
 * The middle case is what the "Video Unavailable" empty state is for; the last
 * one is a retry, not an empty state. Strictly additive: the legacy function
 * above is untouched.
 */
export async function getMatchVideoSignedUrlResult(
  supabase: Client,
  videoId: string,
  expiresInSeconds = 3600,
): Promise<Result<string | null>> {
  const { url, error } = await loadMatchVideoSignedUrl(
    supabase,
    videoId,
    expiresInSeconds,
  );
  return error ? { ok: false, error } : { ok: true, data: url };
}

// ---------------------------------------------------------------------------
// Match detail view (history + playback), V-epic jits-5tj9.6
//
// Additive on purpose: `getMatchDetails` (null on any error, drops `videos`)
// is what the match wizard and reconciler rely on, and the two signed-URL
// functions above keep their exact contracts. Everything here is
// Result-shaped and never throws.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MATCH_NOT_FOUND_ERROR: DomainError = {
  code: "MATCH_NOT_FOUND",
  message: "Match not found.",
};

/** Max `get_match_details` fallback calls one `getMyMatchVideos` may make. */
const MY_MATCH_VIDEOS_DETAIL_CAP = 20;

function unexpectedError(context: string, err: unknown): DomainError {
  console.error(`${context}:`, err);
  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : "Something went wrong.",
  };
}

/**
 * Sign a `match_videos.thumbnail_url` for display. The column holds a STORAGE
 * KEY in the private bucket (jits-fjzy), not a URL; a legacy `http...` value
 * passes through. Best effort: any failure yields null, never an error.
 */
async function signPosterKey(
  supabase: Client,
  key: string | null | undefined,
  expiresInSeconds: number,
): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  try {
    const { data, error } = await supabase.storage
      .from(MATCH_VIDEO_BUCKET)
      .createSignedUrl(key, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** One entry of `get_match_details().videos` (deleted rows never present). */
interface MatchDetailsVideoRow {
  id: string;
  uploaded_by: string;
  uploaded_by_name: string | null;
  status: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  camera_angle: string | null;
  angle_quality: number | null;
  has_analysis: boolean | null;
  analysis_tier: string | null;
}

export interface MatchDetailVideo {
  /** match_videos.id (the player route param). */
  id: string;
  /** Uploader athlete id. */
  uploaded_by: string;
  uploaded_by_name: string | null;
  /** Raw match_videos.status. */
  status: string;
  playability: VideoPlayability;
  duration_seconds: number | null;
  camera_angle: string | null;
  has_analysis: boolean;
  /** uploaded_by === viewer. */
  is_mine: boolean;
  /** "Your recording" / "<name>'s recording". */
  angle_label: string;
  /** Signed thumbnail key (1h), http passthrough, or null. */
  poster_url: string | null;
}

export interface MatchDetailView {
  match: Omit<MatchDetails, "participants">;
  /** The viewer's participant row. */
  me: MatchParticipant;
  /** The other participant (null only on corrupt data). */
  opponent: MatchParticipant | null;
  /** Viewer's own first; deleted rows are never present, failed ones are. */
  videos: MatchDetailVideo[];
}

/**
 * Match detail for a history row, via `get_match_details` (SECURITY DEFINER,
 * participant-gated, no status filter, so disputed matches are included).
 * Result-shaped so the UI can tell "not yours" (NOT_PARTICIPANT) from "gone"
 * (MATCH_NOT_FOUND) from "network" (anything else).
 */
export async function getMatchDetailView(
  supabase: Client,
  matchId: string,
  viewerAthleteId: string,
): Promise<Result<MatchDetailView>> {
  // Deep links and route params are untrusted; a malformed id would only earn
  // a 22P02 from Postgres, so answer "not found" without the round trip.
  if (!UUID_RE.test(matchId)) return { ok: false, error: MATCH_NOT_FOUND_ERROR };

  try {
    const { data, error } = await supabase.rpc("get_match_details", {
      p_match_id: matchId,
    });
    if (error) {
      console.error("getMatchDetailView:", error);
      return { ok: false, error: mapPostgrestError(error, "match_detail") };
    }
    if (!data) return { ok: false, error: MATCH_NOT_FOUND_ERROR };

    const payload = data as unknown as {
      match: Omit<MatchDetails, "participants">;
      participants: MatchParticipant[] | null;
      videos?: MatchDetailsVideoRow[] | null;
    };
    const participants = payload.participants ?? [];
    const me = participants.find((p) => p.athlete_id === viewerAthleteId);
    // The RPC also admits the timekeeper, who has no participant row.
    if (!me) {
      return {
        ok: false,
        error: {
          code: "NOT_PARTICIPANT",
          message: "You are not a participant in this match.",
        },
      };
    }
    const opponent =
      participants.find((p) => p.athlete_id !== viewerAthleteId) ?? null;

    const rows = sortMatchVideosForViewer(payload.videos ?? [], viewerAthleteId);
    const posters = await Promise.all(
      rows.map((v) => signPosterKey(supabase, v.thumbnail_url, 3600)),
    );
    const videos: MatchDetailVideo[] = rows.map((v, i) => {
      const isMine = v.uploaded_by === viewerAthleteId;
      return {
        id: v.id,
        uploaded_by: v.uploaded_by,
        uploaded_by_name: v.uploaded_by_name,
        status: v.status,
        playability: videoPlayability(v.status),
        duration_seconds: v.duration_seconds,
        camera_angle: v.camera_angle,
        has_analysis: v.has_analysis === true,
        is_mine: isMine,
        angle_label: videoAngleLabel(
          v.uploaded_by,
          viewerAthleteId,
          v.uploaded_by_name ?? (isMine ? null : opponent?.display_name ?? null),
        ),
        poster_url: posters[i],
      };
    });

    return { ok: true, data: { match: payload.match, me, opponent, videos } };
  } catch (err) {
    return { ok: false, error: unexpectedError("getMatchDetailView", err) };
  }
}

export interface MatchVideoPlayback {
  /** Signed URL of normalized_path ?? storage_path. */
  url: string;
  /** Signed thumbnail key, best effort. */
  posterUrl: string | null;
  /** match_videos.status at read time. */
  status: string;
  playability: VideoPlayability;
}

/**
 * Everything the player needs for one video id.
 *
 *   { ok: true, data: MatchVideoPlayback }   sign it and play
 *   { ok: true, data: null }                 no row visible (deleted, or not a
 *                                            participant) or no path yet
 *   { ok: false, error: VIDEO_FILE_MISSING } row exists, storage says the
 *                                            object does not
 *   { ok: false, error: <other> }            read or sign failed, retryable
 */
export async function getMatchVideoPlaybackResult(
  supabase: Client,
  videoId: string,
  expiresInSeconds = 3600,
): Promise<Result<MatchVideoPlayback | null>> {
  // A malformed id can match no row; skip the round trip (and its 22P02).
  if (!UUID_RE.test(videoId)) return { ok: true, data: null };
  try {
    const { data, error } = await supabase
      .from("match_videos")
      .select("storage_path, normalized_path, thumbnail_url, status")
      .eq("id", videoId)
      .maybeSingle();
    if (error) {
      console.error("getMatchVideoPlaybackResult:", error);
      return {
        ok: false,
        error: mapPostgrestError(error, "match_video_playback"),
      };
    }
    // Same single-source rule as loadMatchVideoSignedUrl (jits-8t0m): prefer
    // the normalized H.264/AAC MP4 when the slicer wrote one, else the original.
    const playbackPath = data?.normalized_path ?? data?.storage_path;
    // A deleted row is absence, even though RLS still returns it.
    if (!data || !playbackPath || data.status === "deleted") {
      return { ok: true, data: null };
    }

    const [{ data: signed, error: signError }, posterUrl] = await Promise.all([
      supabase.storage
        .from(MATCH_VIDEO_BUCKET)
        .createSignedUrl(playbackPath, expiresInSeconds),
      signPosterKey(supabase, data.thumbnail_url, expiresInSeconds),
    ]);
    if (signError) {
      console.error("getMatchVideoPlaybackResult sign:", signError);
      // Storage answers "Object not found" (404) when the row outlived its
      // file. "Bucket not found" is a config failure, not a missing file.
      const statusCode = (signError as { statusCode?: unknown }).statusCode;
      if (
        /not.?found/i.test(signError.message) &&
        !/bucket/i.test(signError.message) &&
        (statusCode == null || String(statusCode) === "404")
      ) {
        return {
          ok: false,
          error: {
            code: "VIDEO_FILE_MISSING",
            message: "The video file was not found.",
          },
        };
      }
      return { ok: false, error: { code: "UNKNOWN", message: signError.message } };
    }
    if (!signed?.signedUrl) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "Storage returned no signed URL." },
      };
    }
    return {
      ok: true,
      data: {
        url: signed.signedUrl,
        posterUrl,
        status: data.status,
        playability: videoPlayability(data.status),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: unexpectedError("getMatchVideoPlaybackResult", err),
    };
  }
}

export interface MatchVideoListItem {
  match_id: string;
  /** "completed" for history matches, else get_match_details status ("disputed", ...), or "unknown". */
  match_status: string;
  /** "ranked" | "casual" */
  match_type: string | null;
  /** completed_at, else the newest video's created_at. */
  match_date: string | null;
  opponent_id: string | null;
  opponent_name: string | null;
  outcome: "win" | "loss" | "draw" | null;
  video_count: number;
  /** Videos whose playability !== "processing" (failed still counts). */
  playable_count: number;
  /** Max created_at of the group. */
  latest_video_at: string;
}

function asOutcome(
  value: string | null | undefined,
): MatchVideoListItem["outcome"] {
  return value === "win" || value === "loss" || value === "draw" ? value : null;
}

/**
 * Every non-deleted video in the caller's matches (both uploaders, failed
 * included, disputed matches included), grouped one item per match, newest
 * first. Composed client-side because `get_athlete_videos` hides failed
 * videos and disputed matches and caps at 10 with no offset.
 *
 * `opts.limit` caps the video ROWS read (default 100). Matches missing from
 * `get_match_history` (disputed, voided, in progress) are enriched through
 * `get_match_details`, at most 20 calls; the rest are kept with null metadata
 * and `match_status: "unknown"`. A video is never dropped. The only failure
 * is the video list read itself.
 *
 * Known undercount: when exactly `limit` rows come back, the oldest group may
 * be truncated (its `video_count` / `playable_count` too low, and older
 * matches absent). Harmless at demo scale; raise `limit` if it matters.
 */
export async function getMyMatchVideos(
  supabase: Client,
  athleteId: string,
  opts?: { limit?: number },
): Promise<Result<MatchVideoListItem[]>> {
  const limit = opts?.limit ?? 100;
  try {
    // RLS (match_videos_select_participant) scopes this to the caller's
    // matches. No embedded joins: match_participants is RLS-blocked and the
    // metadata comes from the RPCs below.
    const { data, error } = await supabase
      .from("match_videos")
      .select("id, match_id, uploaded_by, status, created_at")
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("getMyMatchVideos:", error);
      return { ok: false, error: mapPostgrestError(error, "match_video_list") };
    }

    // Map keeps first-seen order, which is newest-first from the query.
    const groups = new Map<
      string,
      { video_count: number; playable_count: number; latest_video_at: string }
    >();
    for (const row of data ?? []) {
      const g = groups.get(row.match_id) ?? {
        video_count: 0,
        playable_count: 0,
        latest_video_at: row.created_at,
      };
      g.video_count += 1;
      if (videoPlayability(row.status) !== "processing") g.playable_count += 1;
      if (row.created_at > g.latest_video_at) g.latest_video_at = row.created_at;
      groups.set(row.match_id, g);
    }
    if (groups.size === 0) return { ok: true, data: [] };

    // getMatchHistory already returns [] on failure; the fallback below then
    // covers whatever it can within the cap.
    const history = await getMatchHistory(supabase, athleteId);
    const historyById = new Map(history.map((h) => [h.match_id, h]));

    const fallbackIds = [...groups.keys()]
      .filter((id) => !historyById.has(id))
      .slice(0, MY_MATCH_VIDEOS_DETAIL_CAP);
    const details = await Promise.all(
      fallbackIds.map((id) => getMatchDetails(supabase, id).catch(() => null)),
    );
    const detailsById = new Map(fallbackIds.map((id, i) => [id, details[i]]));

    const items: MatchVideoListItem[] = [];
    for (const [matchId, g] of groups) {
      const base = { match_id: matchId, ...g };
      const h = historyById.get(matchId);
      if (h) {
        items.push({
          ...base,
          match_status: "completed",
          match_type: h.match_type ?? null,
          match_date: h.completed_at ?? g.latest_video_at,
          opponent_id: h.opponent_id ?? null,
          opponent_name: h.opponent_display_name ?? null,
          outcome: asOutcome(h.athlete_outcome),
        });
        continue;
      }
      const d = detailsById.get(matchId);
      if (d) {
        const me = d.participants?.find((p) => p.athlete_id === athleteId);
        const opp = d.participants?.find((p) => p.athlete_id !== athleteId);
        items.push({
          ...base,
          match_status: d.status,
          match_type: d.match_type ?? null,
          match_date: d.completed_at ?? g.latest_video_at,
          opponent_id: opp?.athlete_id ?? null,
          opponent_name: opp?.display_name ?? null,
          outcome: asOutcome(me?.outcome),
        });
        continue;
      }
      // Detail call failed, or beyond the cap: keep the video, drop the metadata.
      items.push({
        ...base,
        match_status: "unknown",
        match_type: null,
        match_date: g.latest_video_at,
        opponent_id: null,
        opponent_name: null,
        outcome: null,
      });
    }
    return { ok: true, data: items };
  } catch (err) {
    return { ok: false, error: unexpectedError("getMyMatchVideos", err) };
  }
}

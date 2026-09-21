/**
 * Composite types for common Supabase FK join shapes.
 * These represent the data shape AFTER extracting from FK join arrays.
 */

import type { Database } from "./database";

/** FK join shape: athletes!fk_challenges_challenger(id, display_name, current_elo) */
export interface ChallengerJoin {
  id: string;
  display_name: string;
  current_elo: number;
}

/** FK join shape: athletes!fk_challenges_opponent(id, display_name) */
export interface OpponentJoin {
  id: string;
  display_name: string;
}

/** FK join shape: gyms!fk_athletes_primary_gym(name) */
export interface GymJoin {
  name: string;
}

/** FK join shape: matches!fk_participants_match(completed_at, status) */
export interface MatchJoin {
  status: string;
  completed_at: string | null;
}

/** FK join shape: athletes!fk_participants_athlete(display_name) */
export interface AthleteNameJoin {
  display_name: string;
}

/** Computed stats derived from match_participants outcomes */
export interface ComputedStats {
  wins: number;
  losses: number;
  winRate: number;
}

/** ELO stakes returned by calculate_elo_stakes RPC */
export interface EloStakes {
  challenger_win: number;
  challenger_loss: number;
  challenger_draw: number;
  opponent_win: number;
  opponent_loss: number;
  opponent_draw: number;
  challenger_expected: number;
  opponent_expected: number;
  weight_division_gap: number;
  draw_score: number;
}

/** Row returned by get_match_history RPC */
export type MatchHistoryRow =
  Database["public"]["Functions"]["get_match_history"]["Returns"][number];

/** Row returned by get_elo_history RPC */
export type EloHistoryRow =
  Database["public"]["Functions"]["get_elo_history"]["Returns"][number];

/** Response from start_match_from_challenge RPC.
 *  Returns match data directly — no success/error wrapper.
 *  Errors come as PostgreSQL exceptions (PostgrestError). */
export interface StartMatchResponse {
  match_id: string;
  challenge_id: string;
  gym_id: string | null;
  match_type: string;
  duration_seconds: number;
  status: string;
  created_at: string;
  already_exists: boolean;
}

/** ELO change for a single player */
interface EloChange {
  before: number;
  after: number;
  delta: number;
}

/** Response from record_match_result RPC */
export interface RecordResultResponse {
  success: boolean;
  match_id?: string;
  result?: string;
  elo_changes?:
    | ({ winner: EloChange; loser: EloChange; weight_division_gap?: number } & { player_a?: never; player_b?: never })
    | ({ player_a: EloChange; player_b: EloChange; weight_division_gap?: number } & { winner?: never; loser?: never })
    | null;
  error?: string;
}

/** Response from start_match RPC */
export interface StartMatchTimerResponse {
  success: boolean;
  match_id?: string;
  started_at?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Aggregated RPC response types (JSONB return shapes)
// ---------------------------------------------------------------------------

/** Response from get_dashboard_summary RPC */
export interface DashboardSummary {
  stats: {
    wins: number;
    losses: number;
    draws: number;
    win_streak: number;
    best_win_streak: number;
    total_matches: number;
  };
  rank: {
    current: number;
    best: number;
    total: number;
  };
  recent_matches: {
    match_id: string;
    opponent_name: string;
    outcome: "win" | "loss" | "draw";
    match_type: string;
    elo_delta: number;
    completed_at: string;
  }[];
  pending_challenges: {
    incoming: {
      id: string;
      created_at: string;
      expires_at: string;
      match_type: string;
      challenger_weight: number | null;
      challenger_id: string;
      challenger_name: string;
      challenger_photo_url: string | null;
    }[];
    sent: {
      id: string;
      created_at: string;
      expires_at: string;
      match_type: string;
      opponent_id: string;
      opponent_name: string;
      opponent_photo_url: string | null;
    }[];
  };
  accepted_challenges: {
    id: string;
    created_at: string;
    match_type: string;
    opponent_name: string;
    opponent_photo_url: string | null;
  }[];
  recent_activity: RecentActivityItem[];
}

/** Response from get_arena_data RPC */
export interface ArenaData {
  looking_athletes: {
    id: string;
    display_name: string;
    current_elo: number;
    gym_name: string | null;
    looking_for_casual: boolean;
    looking_for_ranked: boolean;
    profile_photo_url: string | null;
    current_weight: number | null;
  }[];
  other_athletes: {
    id: string;
    display_name: string;
    current_elo: number;
    gym_name: string | null;
    profile_photo_url: string | null;
    current_weight: number | null;
  }[];
  challenged_opponent_ids: string[];
  recent_activity: RecentActivityItem[];
}

/** Shape of a single item from get_recent_activity RPC */
export interface RecentActivityItem {
  match_id: string;
  winner_name: string;
  loser_name: string;
  result: string;
  match_type: string;
  completed_at: string;
}

// ---------------------------------------------------------------------------
// Pending challenges (challenge inbox / outbox)
// ---------------------------------------------------------------------------

/**
 * One live challenge as the inbox/outbox surfaces render it: still `pending`
 * and not yet past `expires_at`, with BOTH display names resolved so a caller
 * can render either direction without a second lookup.
 *
 * DELIBERATELY DECLARED HERE, NOT IN `api/queries.ts`. The root barrel
 * (`src/index.ts`) star-exports both `./api` and `./hooks`, and
 * `hooks/use-pending-challenges.ts` already exports a different, narrower
 * `PendingChallenge` (received-only, no ids). Exporting a second one through
 * `./api` would make the name ambiguous in the barrel and fail the build with
 * TS2308. Living in `types/composites.ts` keeps the intended name AND keeps the
 * two out of the same barrel:
 *
 *     import { getPendingChallengesForAthlete } from "@jits/shared/api/queries";
 *     import type { PendingChallenge } from "@jits/shared/types/composites";
 */
export interface PendingChallenge {
  challengeId: string;
  challengerId: string;
  opponentId: string;
  /** `athletes.display_name` of the challenger; "Unknown" if the join is empty. */
  challengerName: string;
  /** `athletes.display_name` of the opponent; "Unknown" if the join is empty. */
  opponentName: string;
  matchType: Database["public"]["Enums"]["match_type_enum"];
  createdAt: string;
  expiresAt: string;
  /** Weights (lbs) proposed on the challenge; null when not supplied. */
  challengerWeight: number | null;
  opponentWeight: number | null;
}

/**
 * The athlete's live challenges, split by direction.
 *
 * `incoming` = they are the OPPONENT (someone challenged them: the inbox, the
 * side with accept/decline). `outgoing` = they are the CHALLENGER (what they
 * sent and are waiting on). Both are newest-first.
 */
export interface PendingChallengesForAthlete {
  incoming: PendingChallenge[];
  outgoing: PendingChallenge[];
}

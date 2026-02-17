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

/** Response from start_match_from_challenge RPC */
export interface StartMatchResponse {
  success: boolean;
  match_id?: string;
  challenge_id?: string;
  gym_id?: string | null;
  match_type?: string;
  duration_seconds?: number;
  status?: string;
  created_at?: string;
  already_exists?: boolean;
  error?: string;
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
    }[];
    sent: {
      id: string;
      created_at: string;
      expires_at: string;
      match_type: string;
      opponent_id: string;
      opponent_name: string;
    }[];
  };
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
  recent_activity: {
    match_id: string;
    winner_name: string;
    loser_name: string;
    result: string;
    completed_at: string;
  }[];
}

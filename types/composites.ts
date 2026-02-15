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
  opponent_win: number;
  opponent_loss: number;
  challenger_expected: number;
  opponent_expected: number;
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

/** Response from record_match_result RPC */
export interface RecordResultResponse {
  success: boolean;
  match_id?: string;
  result?: string;
  elo_changes?: {
    winner: { before: number; after: number; delta: number };
    loser: { before: number; after: number; delta: number };
  } | null;
  error?: string;
}

/** Response from start_match RPC */
export interface StartMatchTimerResponse {
  success: boolean;
  match_id?: string;
  error?: string;
}

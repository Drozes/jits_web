import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type Client = SupabaseClient<Database>;

/**
 * The weights a match is rated on: the ones stamped on its challenge when it
 * was sent (`challenger_weight`) and accepted (`opponent_weight`), in lbs.
 * `record_match_result` reads these, not `athletes.current_weight`, and a
 * missing one means no division gap at all.
 */
export interface MatchChallengeWeights {
  challengerId: string;
  opponentId: string;
  challengerWeight: number | null;
  opponentWeight: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Null when the challenge cannot be read (none, RLS, network). */
export async function getMatchChallengeWeights(
  supabase: Client,
  challengeId: string,
): Promise<MatchChallengeWeights | null> {
  try {
    const { data, error } = await supabase
      .from("challenges")
      .select("challenger_id, opponent_id, challenger_weight, opponent_weight")
      .eq("id", challengeId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      challengerId: data.challenger_id,
      opponentId: data.opponent_id,
      challengerWeight: num(data.challenger_weight),
      opponentWeight: num(data.opponent_weight),
    };
  } catch {
    return null;
  }
}

/** This athlete's and the opponent's rated weights, from the challenge. */
export function weightsFor(
  w: MatchChallengeWeights | null,
  meId: string,
): { mine: number | null; theirs: number | null } | null {
  if (!w) return null;
  if (w.challengerId === meId) return { mine: w.challengerWeight, theirs: w.opponentWeight };
  if (w.opponentId === meId) return { mine: w.opponentWeight, theirs: w.challengerWeight };
  return null;
}

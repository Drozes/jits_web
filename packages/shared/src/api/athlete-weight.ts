import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { mapPostgrestError, type Result } from "./errors";

type Client = SupabaseClient<Database>;

/** The range profile setup accepts for `athletes.current_weight` (lbs). */
export const ATHLETE_WEIGHT_MIN_LBS = 50;
export const ATHLETE_WEIGHT_MAX_LBS = 400;

/** True for a finite weight inside the accepted lbs range. */
export function isValidAthleteWeight(lbs: number): boolean {
  return Number.isFinite(lbs) && lbs >= ATHLETE_WEIGHT_MIN_LBS && lbs <= ATHLETE_WEIGHT_MAX_LBS;
}

/**
 * Update the signed-in athlete's scale weight (`athletes.current_weight`,
 * pounds, the canonical unit: no conversion). Used by the match face-off's
 * weigh-in edit. `current_weight` is not trigger-guarded, so a successful
 * update really changes it; the row filter is the athlete's own id and RLS
 * only lets an athlete update their own row.
 */
export async function updateAthleteWeight(
  supabase: Client,
  athleteId: string,
  weightLbs: number,
): Promise<Result<{ weight: number }>> {
  if (!isValidAthleteWeight(weightLbs)) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: `Weight must be between ${ATHLETE_WEIGHT_MIN_LBS} and ${ATHLETE_WEIGHT_MAX_LBS} lbs.`,
      },
    };
  }
  const weight = Math.round(weightLbs * 10) / 10;
  const { error } = await supabase.from("athletes").update({ current_weight: weight }).eq("id", athleteId);
  if (error) return { ok: false, error: mapPostgrestError(error) };
  return { ok: true, data: { weight } };
}

/**
 * The IBJJF division gap between two weights, as the server rates it
 * (timekeeper mode A28, spec 2.3 item 1): the face-off's division line and
 * weight-gap note read this instead of the retired stakes read.
 *
 * Mirrors jr_be `get_weight_division(p_weight)` (`20260217000000`, the
 * IBJJF Male No-Gi upper bounds in lbs, inclusive), which
 * `record_match_result` and `get_rating_stakes` use on the challenge's
 * weights. Informational only since Rating V9: no number depends on it.
 */
const DIVISION_UPPER_BOUNDS_LBS = [122.5, 136, 149, 162, 175.5, 188.5, 202, 215] as const;

/** 0 (Rooster) to 8 (Ultra Heavy). */
export function weightDivision(weightLbs: number): number {
  const i = DIVISION_UPPER_BOUNDS_LBS.findIndex((upper) => weightLbs <= upper);
  return i === -1 ? DIVISION_UPPER_BOUNDS_LBS.length : i;
}

/** How many divisions apart two weights are (0: the same division). */
export function weightDivisionGap(a: number, b: number): number {
  return Math.abs(weightDivision(a) - weightDivision(b));
}

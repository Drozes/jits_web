/**
 * Pure validation helpers for the session join wizard's weight step.
 * Mirrors the rules used in the profile-setup wizard:
 *   - Weight: numeric, 50–400 lbs
 */

export const MIN_WEIGHT_LBS = 50;
export const MAX_WEIGHT_LBS = 400;

export function isValidWeight(value: string): boolean {
  const parsed = parseFloat(value);
  return (
    !Number.isNaN(parsed) && parsed >= MIN_WEIGHT_LBS && parsed <= MAX_WEIGHT_LBS
  );
}

export function parseWeight(value: string): number | null {
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

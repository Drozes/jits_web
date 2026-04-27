/**
 * Pure validation helpers for the profile-setup wizard.
 * Mirrors the rules used in `apps/web/app/profile/setup/steps/*`:
 *   - Display name: non-empty after trim
 *   - DOB: must parse to a real date and resolve to age >= 16
 *   - Weight: numeric, 50–400 lbs
 */

const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOfBirth(value: string): boolean {
  if (!DOB_REGEX.test(value)) return false;
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return false;
  // Reject future dates and dates >120 years old to catch typos.
  const now = new Date();
  if (dob > now) return false;
  const minAllowed = new Date();
  minAllowed.setFullYear(now.getFullYear() - 120);
  if (dob < minAllowed) return false;
  return true;
}

export function isAtLeast16(dateOfBirth: string): boolean {
  if (!isValidDateOfBirth(dateOfBirth)) return false;
  const dob = new Date(dateOfBirth);
  const now = new Date();
  const age =
    now.getFullYear() -
    dob.getFullYear() -
    (now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())
      ? 1
      : 0);
  return age >= 16;
}

export function isValidWeight(value: string): boolean {
  const parsed = parseFloat(value);
  return !Number.isNaN(parsed) && parsed >= 50 && parsed <= 400;
}

export function isIdentityComplete(values: {
  displayName: string;
  gender: string;
  dateOfBirth: string;
}): boolean {
  return (
    !!values.displayName.trim() &&
    !!values.gender &&
    isAtLeast16(values.dateOfBirth)
  );
}

export function isTrainingComplete(values: {
  weight: string;
  gymId: string;
  freeAgent: boolean;
}): boolean {
  if (!isValidWeight(values.weight)) return false;
  return values.freeAgent || !!values.gymId;
}

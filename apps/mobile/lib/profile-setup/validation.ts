/**
 * Pure validation helpers for the profile-setup wizard.
 * Mirrors the rules used in `apps/web/app/profile/setup/steps/*`:
 *   - Display name: non-empty after trim
 *   - DOB: must parse to a real date and resolve to age >= 16
 *   - Weight: numeric, 50–400 lbs
 *   - Instagram handles (athlete and gym): optional; the server's
 *     normalize-then-CHECK rule (`isValidInstagramInput`), blank is valid
 */
import { checkDateOfBirth, isValidInstagramInput } from "@jits/shared/utils";
import { FREE_AGENT_OPTION } from "../../components/profile-setup/types";

export const INSTAGRAM_HANDLE_ERROR =
  "Use up to 30 letters, numbers, periods or underscores.";

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

/**
 * 16 or older on today's UTC calendar date: the server checks age against
 * Postgres `current_date` (UTC), and so do the shared `checkDateOfBirth` and
 * the DOB picker, so all three agree on the 16th birthday whatever the
 * device's time zone.
 */
export function isAtLeast16(dateOfBirth: string, today: Date = new Date()): boolean {
  if (!isValidDateOfBirth(dateOfBirth)) return false;
  return checkDateOfBirth(dateOfBirth, today) === "ok";
}

export function isValidWeight(value: string): boolean {
  const parsed = parseFloat(value);
  return !Number.isNaN(parsed) && parsed >= 50 && parsed <= 400;
}

/**
 * "Who Are You" step: name, gender, DOB (16+), weight (moved here from the
 * training step, jits-02vo.5) and an optional, well-formed Instagram handle.
 */
export function isIdentityComplete(values: {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  weight: string;
  instagram: string;
}): boolean {
  return (
    !!values.firstName.trim() &&
    !!values.lastName.trim() &&
    !!values.gender &&
    isAtLeast16(values.dateOfBirth) &&
    isValidWeight(values.weight) &&
    isValidInstagramInput(values.instagram)
  );
}

/**
 * Training step is complete when a gym is selected (a real gym id OR the
 * free-agent sentinel), a city has been chosen, and the optional gym Instagram
 * is well-formed. An empty `gymId` means the picker is still on its
 * placeholder. The gym handle is ignored for free agents (the field is hidden).
 */
export function isTrainingComplete(values: {
  gymId: string;
  city: string;
  gymInstagram: string;
}): boolean {
  if (!values.gymId) return false;
  if (values.gymId !== FREE_AGENT_OPTION && !isValidInstagramInput(values.gymInstagram)) {
    return false;
  }
  return !!values.city.trim();
}

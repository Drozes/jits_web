/**
 * Shared types for the mobile profile-setup wizard.
 * Mirrors `WizardValues` in `apps/web/app/profile/setup/setup-wizard.tsx`.
 *
 * Free-agent status is derived from `gymId === FREE_AGENT_OPTION` rather than a
 * separate boolean: the gym field is a single native picker whose first option
 * is "Free agent (no gym)". An empty `gymId` means unselected (placeholder), so
 * the sentinel must never be the empty string.
 */
export const FREE_AGENT_OPTION = "free_agent";

export interface WizardValues {
  firstName: string;
  lastName: string;
  weight: string;
  gymId: string;
  gender: string;
  dateOfBirth: string;
  city: string;
}

export type WizardStep = "tos" | "identity" | "training";

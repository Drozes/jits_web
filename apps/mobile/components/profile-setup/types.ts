/**
 * Shared types for the mobile profile-setup wizard.
 * Mirrors `WizardValues` in `apps/web/app/profile/setup/setup-wizard.tsx`
 * with the addition of a `freeAgent` flag (web does not yet expose a free
 * agent toggle in setup; mobile does, per the A3 spec).
 */
export interface WizardValues {
  displayName: string;
  weight: string;
  gymId: string;
  gender: string;
  dateOfBirth: string;
  city: string;
  freeAgent: boolean;
}

export type WizardStep = "tos" | "identity" | "training" | "optional";

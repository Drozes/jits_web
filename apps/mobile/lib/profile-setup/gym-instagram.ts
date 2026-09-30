import { normalizeInstagramHandle } from "@jits/shared/utils";
import { FREE_AGENT_OPTION, type WizardValues } from "../../components/profile-setup/types";
import type { GymOption } from "./use-setup-data";

/** Who may change a gym's handle: its managers, and platform admins. */
export interface GymAccess {
  managedGymIds: string[];
  isAdmin: boolean;
}

export interface GymInstagramField {
  /** False for free agents and before a gym is picked. */
  visible: boolean;
  /** The gym already has a handle and the caller cannot change it. */
  readOnly: boolean;
  /** The selected gym's stored (normalized) handle, or null. */
  storedHandle: string | null;
  canManage: boolean;
}

/**
 * Gym Instagram field state for the selected gym. Mirrors the
 * `set_gym_instagram_handle` rule (jr_be-ahn.3): a manager/admin sets, changes
 * or clears it; a member may only fill it while blank, so an existing handle is
 * shown read-only to a non-manager.
 */
export function gymInstagramField(
  gymId: string,
  gyms: GymOption[],
  access: GymAccess,
): GymInstagramField {
  if (!gymId || gymId === FREE_AGENT_OPTION) {
    return { visible: false, readOnly: false, storedHandle: null, canManage: false };
  }
  const storedHandle = gyms.find((g) => g.id === gymId)?.instagram_handle ?? null;
  const canManage = access.isAdmin || access.managedGymIds.includes(gymId);
  return {
    visible: true,
    readOnly: !canManage && storedHandle !== null,
    storedHandle,
    canManage,
  };
}

/**
 * The `set_gym_instagram_handle` call the submit should make, or null when
 * there is nothing to write (free agent, read-only, or unchanged). "" clears,
 * which only a manager can reach (a member with a blank gym handle submitting
 * blank is "unchanged").
 */
export function planGymInstagramWrite(
  values: Pick<WizardValues, "gymId" | "gymInstagram">,
  field: GymInstagramField,
): { gymId: string; handle: string } | null {
  if (!field.visible || field.readOnly) return null;
  const next = normalizeInstagramHandle(values.gymInstagram);
  if (next === field.storedHandle) return null;
  return { gymId: values.gymId, handle: next ?? "" };
}

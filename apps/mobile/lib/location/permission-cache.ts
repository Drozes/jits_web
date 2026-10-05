/**
 * The foreground location permission as last read in this process, for the
 * synchronous first-frame decisions of a restore (review round 2, QA E: with
 * the store read and no valid tag, a permission believed granted draws
 * FINDING YOU from the first frame, not a GO LIVE hold). Read (never asked)
 * as soon as the athlete row loads, and again by every go-live and restore.
 */
import * as Location from "expo-location";

export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  /** Android approximate location only (no reading can pass 100 m). */
  coarse?: boolean;
}

let last: PermissionState | null = null;

/** The last permission state read, or null before the first read. */
export function lastKnownLocationPermission(): PermissionState | null {
  return last;
}

/** Read the permission (never asks) and remember it. Never rejects. */
export async function readLocationPermission(): Promise<PermissionState> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    last = {
      granted: Boolean(p.granted),
      canAskAgain: Boolean(p.canAskAgain),
      ...((p as { android?: { accuracy?: string } }).android?.accuracy === "coarse" ? { coarse: true } : {}),
    };
  } catch {
    last = { granted: false, canAskAgain: false };
  }
  return last;
}

/** Tests only. */
export function __resetLocationPermissionCacheForTests(): void {
  last = null;
}

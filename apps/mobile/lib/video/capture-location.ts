/**
 * Where this face-off happens, coarsely (dynamic capture bitrate phase 2,
 * spec 16.3 E1, E5): the about 1 km cell the capture history is matched on.
 *
 * Never asks for permission and never throws. Sources, first one that
 * yields wins:
 *   1. the OS cached fix, only when foreground location permission is
 *      ALREADY granted (Android approximate is fine: a 1 km cell needs no
 *      precision), at most 30 minutes old and 3,000 m (approximate fixes
 *      pass: Android approximate is about 2 km, iOS reduced accuracy similar);
 *   2. the device location store: the last server-accepted go_live tag,
 *      then the last accepted browse or arena reading (synchronous, under
 *      4 hours, 100 m or better);
 *   3. otherwise null ("location unknown").
 * The whole read is bounded by `CAPTURE_LOCATION_TIMEOUT_MS`; a slower OS
 * answer falls through to the store.
 *
 * Privacy (E14): the precise reading never leaves this module. Only the
 * rounded cell is returned, and the cell is device-only.
 */
import * as Location from "expo-location";
import { lastKnownLocationPermission, readLocationPermission } from "@/lib/location/permission-cache";
import { getDeviceLocationOwner, validDeviceReading, validDeviceTag } from "@/lib/location/device-location-store";
import {
  CAPTURE_LOCATION_MAX_ACCURACY_M,
  CAPTURE_LOCATION_MAX_AGE_MS,
  CAPTURE_LOCATION_TIMEOUT_MS,
  coarseGeoCell,
  type CaptureGeoCell,
} from "./capture-bitrate";

/** Source 1: the OS cached fix under an existing grant, or null. Never asks. */
async function osCachedCell(): Promise<CaptureGeoCell | null> {
  try {
    const permission = lastKnownLocationPermission() ?? (await readLocationPermission());
    if (!permission.granted) return null;
    const last = await Location.getLastKnownPositionAsync({
      maxAge: CAPTURE_LOCATION_MAX_AGE_MS,
      requiredAccuracy: CAPTURE_LOCATION_MAX_ACCURACY_M,
    });
    if (!last) return null;
    // The OS may ignore the options: the same checks on the fix itself.
    const accuracy = last.coords.accuracy;
    if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy <= 0) return null;
    if (accuracy > CAPTURE_LOCATION_MAX_ACCURACY_M) return null;
    const age = Date.now() - last.timestamp;
    if (!Number.isFinite(age) || age < 0 || age > CAPTURE_LOCATION_MAX_AGE_MS) return null;
    return coarseGeoCell(last.coords.latitude, last.coords.longitude);
  } catch {
    return null;
  }
}

/** Source 2: the device location store (no permission needed), or null. */
function storedCell(): CaptureGeoCell | null {
  try {
    const owner = getDeviceLocationOwner();
    const entry = validDeviceTag(owner) ?? validDeviceReading(owner);
    return entry ? coarseGeoCell(entry.lat, entry.lng) : null;
  } catch {
    return null;
  }
}

/** The face-off's coarse cell, or null. Never throws, never asks, bounded. */
export async function readCaptureLocation(): Promise<CaptureGeoCell | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CAPTURE_LOCATION_TIMEOUT_MS);
    });
    const fromOs = await Promise.race([osCachedCell(), timeout]);
    return fromOs ?? storedCell();
  } catch {
    return storedCell();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

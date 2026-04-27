/**
 * Helpers for the geo-check step of the session join wizard.
 *
 * Mirrors `apps/web/app/(app)/session/[id]/join/steps/geo-check-step.tsx`,
 * which uses a 2 km threshold for "you're at the gym". Web is lenient
 * because browser geolocation can be very noisy; we use the same
 * threshold on mobile for parity.
 *
 * The Haversine implementation lives in `apps/mobile/lib/location/use-location.ts`
 * (Phase 3 Track B). This file just wraps it with the threshold helper.
 */

import { haversineKm, type LocationPosition } from "../location/use-location";

/** Threshold in km. If `distance < THRESHOLD_KM` we treat the user as "at the gym". */
export const GYM_PROXIMITY_THRESHOLD_KM = 2;

export type GymProximity = "near" | "far";

/**
 * Computes the proximity label between an athlete's current position
 * and the gym's coordinates.
 */
export function classifyProximity(
  athletePos: LocationPosition,
  gym: { latitude: number; longitude: number },
): { distanceKm: number; proximity: GymProximity } {
  const distanceKm = haversineKm(athletePos, gym);
  return {
    distanceKm,
    proximity: distanceKm < GYM_PROXIMITY_THRESHOLD_KM ? "near" : "far",
  };
}

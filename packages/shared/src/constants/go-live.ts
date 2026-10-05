/**
 * Instant go-live (jr_be 016 addendum, "optimistic go-live", section 4.2):
 * the location tag windows the clients share, and the pure helpers that
 * judge a tag and a drift on the device. The server is the authority for
 * every rule here (`_go_live_params()`); these mirror it so the client never
 * relies on a tag the server is about to refuse.
 */

/** A `go_live` tag captured within this window is valid for going live (server `tag_max_age`). */
export const GO_LIVE_TAG_MAX_AGE_MS = 4 * 60 * 60 * 1000;
/** Client margin, so a tag about to expire is never relied on. */
export const GO_LIVE_TAG_MARGIN_MS = 2 * 60 * 1000;
/** The accuracy ceiling for a tag (server `accuracy_ceiling_m`). */
export const GO_LIVE_TAG_ACCURACY_M = 100;
/** Drift check: moved more than this (net of accuracy) from the tag. */
export const DRIFT_DISTANCE_M = 500;
/** Drift check cadence while live (flag `live_location_drift_check`). */
export const DRIFT_INTERVAL_MS = 5 * 60 * 1000;
/** A rung 1 go-live takes the one silent refresh only when its tag is older than this (D6). */
export const BACKGROUND_REFRESH_AFTER_MS = 15 * 60 * 1000;

/** `feature_flags` keys added by the instant go-live migration (both seeded OFF). */
export const MATCH_PROXIMITY_REQUIRED_FLAG = "match_proximity_required";
export const LIVE_LOCATION_DRIFT_CHECK_FLAG = "live_location_drift_check";

/** Which rung of the location ladder produced the tag (`athlete_location_events.source`). */
export type GoLiveTagSource = "server_tag" | "device" | "os_cache" | "fresh";

export interface TagLike {
  /** Capture time, ms epoch. */
  capturedAt: number;
  accuracyM: number;
}

/**
 * "Valid" on the device: captured less than 4 h minus the 2 minute margin
 * ago (and not in the future beyond the server's 5 minute skew), with
 * accuracy 100 m or better.
 */
export function isGoLiveTagValid(tag: TagLike | null | undefined, now: number = Date.now()): boolean {
  if (!tag) return false;
  const { capturedAt, accuracyM } = tag;
  if (!Number.isFinite(capturedAt) || !Number.isFinite(accuracyM)) return false;
  if (accuracyM <= 0 || accuracyM > GO_LIVE_TAG_ACCURACY_M) return false;
  const age = now - capturedAt;
  // A capture time well in the future is a wrong clock: the server refuses it
  // (`captured_at_invalid`), so it is no evidence either.
  if (age < -5 * 60 * 1000) return false;
  return age < GO_LIVE_TAG_MAX_AGE_MS - GO_LIVE_TAG_MARGIN_MS;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres (the same formula as the server's `_haversine_m`). */
export function haversineM(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The drift rule (spec 4.4): drifted when
 * `haversine(tag, reading) - LEAST(tag.accuracyM + reading.accuracyM, 100) > 500 m`.
 */
export function isDrifted(tag: LatLng & { accuracyM: number }, reading: LatLng & { accuracyM: number }): boolean {
  const allowance = Math.min(tag.accuracyM + reading.accuracyM, GO_LIVE_TAG_ACCURACY_M);
  return haversineM(tag, reading) - allowance > DRIFT_DISTANCE_M;
}

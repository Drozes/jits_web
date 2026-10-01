/**
 * Web side of the `match_location_required` flag (jr_be spec 016 addendum,
 * contract-location-flag.md section 6). The flag read, the presence RPC and
 * the copy all come from `@jits/shared` (the same wrappers and strings as
 * mobile); only the browser geolocation reading lives here.
 *
 * - Flag read: `getMatchLocationRequired`; any failed read is false (the
 *   server is the authority and refuses with a HINT when on).
 * - Reading: `navigator.geolocation.getCurrentPosition`, high accuracy, 10 s
 *   timeout, never a cached fix.
 * - Report: `reportGoLivePresence` before going live, and
 *   `reportArenaPresence(challengeId)` before an Arena match start.
 */
import {
  getMatchLocationRequired,
  reportArenaPresence,
  reportGoLivePresence,
} from "@jits/shared/api/location";
import {
  ARENA_SELF_LOCATION_MISSING_COPY,
  GO_LIVE_ACCURACY_COPY,
  GO_LIVE_LOCATION_DENIED_COPY,
  GO_LIVE_LOCATION_EXPLAIN_COPY,
  IMPLAUSIBLE_MOVEMENT_COPY,
  LOCATION_DENIED_COPY as SHARED_LOCATION_DENIED_COPY,
  arenaProximityCopy,
  arenaProximityMessage,
} from "@jits/shared/utils";

/** Same ceiling as the server (`_proximity_params().accuracy_ceiling_m`). */
export const ACCURACY_CEILING_M = 100;
export const GEO_TIMEOUT_MS = 10_000;
/** While live, the go_live reading is refreshed this often (tab visible). */
export const GO_LIVE_REFRESH_MS = 60_000;
/** While a challenger waits on a pending/accepted challenge, same cadence. */
export const ARENA_WAIT_REFRESH_MS = 60_000;

// ---------------------------------------------------------------------------
// Copy: the shared strings (mobile says the same), plus the one web-only line.

export const LOCATION_EXPLAIN_COPY = GO_LIVE_LOCATION_EXPLAIN_COPY;
/** An Arena accept with location off. */
export const LOCATION_DENIED_COPY = SHARED_LOCATION_DENIED_COPY;
/** Go Live with location off (mobile's Go Live denied state says the same). */
export const GO_LIVE_DENIED_COPY = GO_LIVE_LOCATION_DENIED_COPY;
/** Web has no Open Settings deep link, so say where the switch is. */
export const LOCATION_DENIED_HELP_COPY =
  "Allow location for this site in your browser settings, then try again.";
export const LOCATION_ACCURACY_COPY = GO_LIVE_ACCURACY_COPY;
/** A reading the server refused as implausible movement (> 50 m/s). */
export const LOCATION_IMPLAUSIBLE_COPY = IMPLAUSIBLE_MOVEMENT_COPY;
/** start_match_from_challenge: MY side has no fresh reading. */
export const LOCATION_SELF_MISSING_COPY = ARENA_SELF_LOCATION_MISSING_COPY;
/** start_match_from_challenge: the OTHER side has no fresh reading. */
export const waitingForLocationCopy = (name: string) =>
  arenaProximityCopy({
    hint: "proximity_required",
    detail: "challenger",
    selfRole: "opponent",
    opponentName: name,
  });
export const proximityCopy = (name: string) => arenaProximityMessage(name);

// ---------------------------------------------------------------------------
// Flag

type Client = Parameters<typeof getMatchLocationRequired>[0];

/** `match_location_required`, fail-closed on the client: any error is false. */
export async function readMatchLocationRequired(supabase: Client): Promise<boolean> {
  const res = await getMatchLocationRequired(supabase);
  return res.ok && res.data;
}

// ---------------------------------------------------------------------------
// Browser reading

export interface LocationReading {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Why a reading could not be used. `denied` covers a refused permission and a
 * browser with no geolocation at all (same copy); `accuracy` covers a fix too
 * coarse to trust, a timeout and an undeterminable position ("can't pin");
 * `implausible` is a reading the server refused as implausible movement
 * (`{ok:false, code:'implausible_movement'}`). None of them is retried
 * automatically: the athlete taps Try again (or the next refresh tick runs).
 */
export type LocationFailure = "denied" | "accuracy" | "implausible";

export type ReadingOutcome =
  | { ok: true; reading: LocationReading }
  | { ok: false; failure: LocationFailure };

export function getBrowserReading(): Promise<ReadingOutcome> {
  const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
  if (!geo || typeof geo.getCurrentPosition !== "function") {
    return Promise.resolve({ ok: false, failure: "denied" });
  }
  return new Promise((resolve) => {
    try {
      geo.getCurrentPosition(
        (pos) => {
          const reading = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          resolve(
            reading.accuracy > ACCURACY_CEILING_M
              ? { ok: false, failure: "accuracy" }
              : { ok: true, reading },
          );
        },
        (err) => {
          // 1 = PERMISSION_DENIED; 2 POSITION_UNAVAILABLE and 3 TIMEOUT
          // both mean no usable fix right now.
          resolve({ ok: false, failure: err?.code === 1 ? "denied" : "accuracy" });
        },
        { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
      );
    } catch {
      resolve({ ok: false, failure: "denied" });
    }
  });
}

export type LocationPermission = "granted" | "prompt" | "denied" | "unknown";

/**
 * The browser's geolocation permission without prompting. `unknown` when the
 * Permissions API is missing or refuses the query (older Safari).
 */
export async function locationPermission(): Promise<LocationPermission> {
  try {
    const perms = typeof navigator !== "undefined" ? navigator.permissions : undefined;
    if (!perms?.query) return "unknown";
    const status = await perms.query({ name: "geolocation" as PermissionName });
    return status.state === "granted" || status.state === "prompt" || status.state === "denied"
      ? status.state
      : "unknown";
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// report_match_presence

export type PresenceContext = "go_live" | "arena";

/**
 * Since jr_be `20261001300700` (H1) a go_live / arena report answers only
 * `{ok:true, verdict:'recorded', started:false, match_id:null}`: no verdict,
 * reason or distance worth reading, so success carries nothing.
 */
export type ReportOutcome =
  | { ok: true }
  /**
   * A `{ ok:false, code }` body: `accuracy_too_low`, `implausible_movement`,
   * `not_active` (go_live by a non-active athlete), `booking_closed`.
   */
  | { ok: false; code: string }
  /** The RPC raised (HINT when present) or the network failed. */
  | { ok: false; code: "error"; hint: string | null };

export async function reportMatchPresence(
  supabase: Client,
  reading: LocationReading,
  context: PresenceContext,
  challengeId: string | null = null,
): Promise<ReportOutcome> {
  const shared = { lat: reading.lat, lng: reading.lng, accuracyM: reading.accuracy };
  const res =
    context === "arena" && challengeId
      ? await reportArenaPresence(supabase, shared, challengeId)
      : await reportGoLivePresence(supabase, shared);
  if (!res.ok) {
    const hint = res.error.hint === "unknown" ? null : res.error.hint;
    return { ok: false, code: "error", hint };
  }
  if (!res.data.ok) return { ok: false, code: res.data.code ?? "unknown" };
  return { ok: true };
}

/**
 * Take a fresh reading and report it. `failure` is what the athlete should be
 * told; `failure: null` means the reading was fine but the report did not
 * land (the server then decides on the data it has).
 */
export type CaptureOutcome =
  | { ok: true }
  | { ok: false; failure: LocationFailure }
  | { ok: false; failure: null; report: ReportOutcome };

export async function captureAndReport(
  supabase: Client,
  context: PresenceContext,
  challengeId: string | null = null,
): Promise<CaptureOutcome> {
  const read = await getBrowserReading();
  if (!read.ok) return { ok: false, failure: read.failure };
  const report = await reportMatchPresence(supabase, read.reading, context, challengeId);
  if (report.ok) return { ok: true };
  if (report.code === "accuracy_too_low") return { ok: false, failure: "accuracy" };
  if (report.code === "implausible_movement") return { ok: false, failure: "implausible" };
  return { ok: false, failure: null, report };
}

// ---------------------------------------------------------------------------
// Server HINTs

type RawError = { raw?: { hint?: string | null; details?: string | null } } | null | undefined;

/** supabase-js surfaces the HINT on `error.hint`; shared keeps it on `raw`. */
export function hintOf(error: RawError): string | null {
  return error?.raw?.hint ?? null;
}

/**
 * `start_match_from_challenge` HINT `proximity_required` carries DETAIL
 * `challenger` | `opponent` | `both`: the side(s) with no fresh reading.
 * supabase-js puts DETAIL on `error.details`.
 */
export type ProximityMissing = "challenger" | "opponent" | "both";

export function proximityMissingOf(error: RawError): ProximityMissing | null {
  const d = error?.raw?.details;
  return d === "challenger" || d === "opponent" || d === "both" ? d : null;
}

/**
 * What a proximity refusal means to the viewer: `self_location` (my reading
 * is missing), `peer_location` (theirs is), or `proximity` (both missing,
 * too far apart, or no DETAIL: the same-mat copy).
 */
export type ProximityBlock = "proximity" | "self_location" | "peer_location";

export function proximityBlockFor(
  error: RawError,
  viewer: "challenger" | "opponent",
): ProximityBlock {
  if (hintOf(error) !== "proximity_required") return "proximity";
  const missing = proximityMissingOf(error);
  if (missing === null || missing === "both") return "proximity";
  return missing === viewer ? "self_location" : "peer_location";
}


export type ProximityHint = "proximity_required" | "proximity_failed";

export function isProximityHint(hint: string | null): hint is ProximityHint {
  return hint === "proximity_required" || hint === "proximity_failed";
}

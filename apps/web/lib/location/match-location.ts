/**
 * Web side of the `match_location_required` flag (jr_be spec 016 addendum,
 * contract-location-flag.md section 6). Typed locally on purpose: the shared
 * package is owned by the mobile team, so the web calls the RPC itself here.
 *
 * - Flag read: `feature_flags.match_location_required`; any failed read is
 *   false (the server is the authority and refuses with a HINT when on).
 * - Reading: `navigator.geolocation.getCurrentPosition`, high accuracy, 10 s
 *   timeout, never a cached fix.
 * - Report: `report_match_presence(..., 'go_live')` before going live, and
 *   `(..., 'arena', challengeId)` before an Arena match start.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MATCH_LOCATION_FLAG = "match_location_required";

/** Same ceiling as the server (`_proximity_params().accuracy_ceiling_m`). */
export const ACCURACY_CEILING_M = 100;
export const GEO_TIMEOUT_MS = 10_000;
/** While live, the go_live reading is refreshed this often (tab visible). */
export const GO_LIVE_REFRESH_MS = 60_000;

// ---------------------------------------------------------------------------
// Copy (no em dashes)

export const LOCATION_EXPLAIN_COPY =
  "ELO RATED checks you're on the same mat as your opponent. Your location is only used to start matches.";
export const LOCATION_DENIED_COPY =
  "Location is off. ELO RATED checks you're both on the same mat before a match starts.";
/** Web has no Open Settings deep link, so say where the switch is. */
export const LOCATION_DENIED_HELP_COPY =
  "Allow location for this site in your browser settings, then try again.";
export const LOCATION_ACCURACY_COPY = "Can't pin your location. Try near a window.";
export const proximityCopy = (name: string) =>
  `You need to be on the same mat as ${name} to start.`;

// ---------------------------------------------------------------------------
// Flag

type Client = SupabaseClient;

/** `match_location_required`, fail-closed on the client: any error is false. */
export async function readMatchLocationRequired(supabase: Client): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", MATCH_LOCATION_FLAG)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
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
 * coarse to trust, a timeout and an undeterminable position ("can't pin").
 */
export type LocationFailure = "denied" | "accuracy";

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

export type ReportOutcome =
  | { ok: true; verdict: string | null }
  /** A `{ ok:false, code }` body, e.g. `accuracy_too_low`, `booking_closed`. */
  | { ok: false; code: string }
  /** The RPC raised (HINT when present) or the network failed. */
  | { ok: false; code: "error"; hint: string | null };

export async function reportMatchPresence(
  supabase: Client,
  reading: LocationReading,
  context: PresenceContext,
  challengeId: string | null = null,
): Promise<ReportOutcome> {
  try {
    const { data, error } = await supabase.rpc("report_match_presence", {
      p_lat: reading.lat,
      p_lng: reading.lng,
      p_accuracy_m: reading.accuracy,
      p_context: context,
      p_challenge_id: challengeId,
      p_invite_id: null,
    });
    if (error) return { ok: false, code: "error", hint: error.hint ?? null };
    const body = (data ?? {}) as { ok?: boolean; code?: string; verdict?: string };
    if (body.ok === false) return { ok: false, code: body.code ?? "unknown" };
    return { ok: true, verdict: body.verdict ?? null };
  } catch {
    return { ok: false, code: "error", hint: null };
  }
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
  return { ok: false, failure: null, report };
}

// ---------------------------------------------------------------------------
// Server HINTs

/** supabase-js surfaces the HINT on `error.hint`; shared keeps it on `raw`. */
export function hintOf(error: { raw?: { hint?: string | null } } | null | undefined): string | null {
  return error?.raw?.hint ?? null;
}

export type ProximityHint = "proximity_required" | "proximity_failed";

export function isProximityHint(hint: string | null): hint is ProximityHint {
  return hint === "proximity_required" || hint === "proximity_failed";
}

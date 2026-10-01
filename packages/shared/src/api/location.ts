/**
 * The `match_location_required` flag and the location RPCs around it (jr_be
 * spec 016 addendum, contract-location-flag.md sections 1, 2 and 5).
 *
 * - Flag ON: Go Live needs a fresh `go_live` reading, and every Arena match
 *   start needs both athletes on the same mat (`arena` readings).
 * - Flag OFF: no location anywhere; an invite booking starts from a Start
 *   match button (`start_invite_booking`).
 *
 * Every call returns a Result and never throws. A failed flag read is an
 * error here; the apps treat it as "off" (the server is the authority and
 * refuses with HINT `location_required` / `proximity_required` when it is on).
 */
import type { Result } from "./errors";
import { mapPostgrestError } from "./errors";
import { obj, parsePresence, rpc, str, type Client, type InviteResult, type PresenceResult } from "./invite-rpc";
import type { LocationReading } from "./invites";

export const MATCH_LOCATION_REQUIRED_FLAG = "match_location_required";

/**
 * `match_location_required` from `feature_flags` (authenticated SELECT). A
 * missing row reads as off; a failed read is `{ ok:false, error }`.
 */
export async function getMatchLocationRequired(supabase: Client): Promise<Result<boolean>> {
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", MATCH_LOCATION_REQUIRED_FLAG)
      .maybeSingle();
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: (data as { enabled?: boolean } | null)?.enabled === true };
  } catch (err) {
    return { ok: false, error: { code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) } };
  }
}

function readingArgs(reading: LocationReading) {
  return { p_lat: reading.lat, p_lng: reading.lng, p_accuracy_m: reading.accuracyM };
}

/**
 * The athlete-level Go Live reading (`p_context = 'go_live'`, no scope). The
 * server upserts one current reading per athlete and answers
 * `{ ok:true, verdict:'recorded' }`, or `{ ok:false, code:'accuracy_too_low' }`
 * for a reading coarser than 100 m (not stored).
 */
export function reportGoLivePresence(supabase: Client, reading: LocationReading): Promise<InviteResult<PresenceResult>> {
  return rpc(
    supabase,
    "report_match_presence",
    { ...readingArgs(reading), p_context: "go_live", p_challenge_id: null, p_invite_id: null },
    parsePresence,
  );
}

/**
 * An Arena challenge reading (`p_context = 'arena'`), sent before
 * `start_match_from_challenge` so the proximity gate has a fresh one. It is
 * stored and evaluated but never starts anything.
 */
export function reportArenaPresence(
  supabase: Client,
  reading: LocationReading,
  challengeId: string,
): Promise<InviteResult<PresenceResult>> {
  return rpc(
    supabase,
    "report_match_presence",
    { ...readingArgs(reading), p_context: "arena", p_challenge_id: challengeId, p_invite_id: null },
    parsePresence,
  );
}

/** `start_invite_booking` failure codes (contract-location-flag 5). */
export type StartInviteBookingCode =
  | "location_required"
  | "inviter_busy"
  | "claimer_busy"
  | "booking_closed"
  | "inviter_weekly_cap";

export type StartInviteBookingResult =
  | { ok: true; match_id: string }
  | { ok: false; code: StartInviteBookingCode | string };

export function parseStartInviteBooking(data: unknown): StartInviteBookingResult | null {
  const o = obj(data);
  if (!o) return null;
  if (o.ok === true) {
    const matchId = str(o.match_id);
    return matchId ? { ok: true, match_id: matchId } : null;
  }
  if (o.ok === false) return { ok: false, code: str(o.code) ?? "unknown" };
  return null;
}

/**
 * Start an invite booking from the Start match button (flag OFF). Idempotent:
 * an already-started booking returns its match id, so it also answers "which
 * match did my opponent just start?".
 */
export function startInviteBooking(
  supabase: Client,
  challengeId: string,
): Promise<InviteResult<StartInviteBookingResult>> {
  return rpc(supabase, "start_invite_booking", { p_challenge_id: challengeId }, parseStartInviteBooking);
}

/**
 * Live status changes of one challenge row (the other athlete started the
 * booking: `accepted` -> `started`, or cancelled it). Participants can read
 * their challenges, so the existing realtime on `challenges` carries it.
 */
export function subscribeToChallengeStatus(
  supabase: Client,
  challengeId: string,
  onStatus: (status: string) => void,
): () => void {
  const channel = supabase
    .channel(`challenge-status:${challengeId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "challenges", filter: `id=eq.${challengeId}` },
      (payload) => {
        const status = str((payload.new as { status?: unknown } | null)?.status);
        if (status) onStatus(status);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Arena nearby (contract-arena-nearby.md, 016 addendum)
// ---------------------------------------------------------------------------

/**
 * The viewer-level Arena browse reading (`p_context = 'browse'`, no scope):
 * a NON-live viewer on the Arena with the flag on and location permission
 * already granted. It only feeds the viewer's own `get_arena_nearby`; it
 * never counts for Go Live or a match start. The server answers only
 * `{ ok:true, verdict:'recorded' }` (no distance), or `{ ok:false, code }`
 * (`accuracy_too_low`, a rate limit of one per 30 s, an implausible jump):
 * the caller treats every refusal as "no location".
 */
export function reportBrowsePresence(supabase: Client, reading: LocationReading): Promise<InviteResult<PresenceResult>> {
  return rpc(
    supabase,
    "report_match_presence",
    { ...readingArgs(reading), p_context: "browse", p_challenge_id: null, p_invite_id: null },
    parsePresence,
  );
}

export type ArenaNearbyMode = "flag_off" | "no_location" | "nearby";
export type ArenaDistanceBand = "on_the_mat" | "under_500m" | "under_1km" | "under_2km";
export type ArenaCloseBand = Exclude<ArenaDistanceBand, "on_the_mat">;

export interface ArenaNearby {
  mode: ArenaNearbyMode;
  /** Athletes on the viewer's mat (the match-start proximity rule). */
  onTheMat: string[];
  /** Live athletes within 2 km who are not on the mat, banded, never a number. */
  close: { athleteId: string; band: ArenaCloseBand }[];
}

const NEARBY_MODES: ReadonlySet<string> = new Set(["flag_off", "no_location", "nearby"]);
const CLOSE_BANDS: ReadonlySet<string> = new Set(["under_500m", "under_1km", "under_2km"]);

/**
 * Parse `get_arena_nearby()`. A refusal (`{ ok:false, code:'not_active' }`)
 * or an unknown shape is null (the caller falls back to today's list). Rows
 * with an unknown band are dropped rather than guessed.
 */
export function parseArenaNearby(data: unknown): ArenaNearby | null {
  const o = obj(data);
  if (!o || o.ok !== true) return null;
  const mode = str(o.mode);
  if (!mode || !NEARBY_MODES.has(mode)) return null;
  const onTheMat: string[] = [];
  for (const row of Array.isArray(o.on_the_mat) ? o.on_the_mat : []) {
    const id = str(obj(row)?.athlete_id);
    if (id) onTheMat.push(id);
  }
  const close: ArenaNearby["close"] = [];
  for (const row of Array.isArray(o.close) ? o.close : []) {
    const r = obj(row);
    const id = str(r?.athlete_id);
    const band = str(r?.distance_band);
    if (id && band && CLOSE_BANDS.has(band)) close.push({ athleteId: id, band: band as ArenaCloseBand });
  }
  return { mode: mode as ArenaNearbyMode, onTheMat, close };
}

/**
 * Which live athletes are on the viewer's mat and which are within 2 km
 * (bands only). Mode `flag_off` / `no_location` carries empty lists; the
 * Arena then shows today's list. Never throws.
 */
export function getArenaNearby(supabase: Client): Promise<InviteResult<ArenaNearby>> {
  return rpc(supabase, "get_arena_nearby", {}, parseArenaNearby);
}

/** What a close row shows for its band. */
export const ARENA_BAND_LABEL: Record<ArenaCloseBand, string> = {
  under_500m: "< 500 m",
  under_1km: "< 1 km",
  under_2km: "< 2 km",
};

/** What VoiceOver reads for a band. */
export const ARENA_BAND_SPOKEN: Record<ArenaCloseBand, string> = {
  under_500m: "under 500 meters",
  under_1km: "under 1 kilometer",
  under_2km: "under 2 kilometers",
};

/** Band order for sorting (nearest first). */
export const ARENA_BAND_ORDER: Record<ArenaCloseBand, number> = {
  under_500m: 0,
  under_1km: 1,
  under_2km: 2,
};

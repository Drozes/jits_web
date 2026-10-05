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
import {
  isMissingRpcSignature,
  obj,
  parsePresence,
  rpc,
  str,
  type Client,
  type InviteResult,
  type PresenceResult,
} from "./invite-rpc";
import type { LocationReading } from "./invites";
import {
  LIVE_LOCATION_DRIFT_CHECK_FLAG,
  MATCH_PROXIMITY_REQUIRED_FLAG,
  type GoLiveTagSource,
} from "../constants/go-live";

export const MATCH_LOCATION_REQUIRED_FLAG = "match_location_required";
export { LIVE_LOCATION_DRIFT_CHECK_FLAG, MATCH_PROXIMITY_REQUIRED_FLAG };

/**
 * One `feature_flags` row (authenticated SELECT). A missing row reads as
 * off (an older backend without the key, or a flag never seeded); a failed
 * read is `{ ok:false, error }`.
 */
export async function getFeatureFlag(supabase: Client, key: string): Promise<Result<boolean>> {
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    if (error) return { ok: false, error: mapPostgrestError(error) };
    return { ok: true, data: (data as { enabled?: boolean } | null)?.enabled === true };
  } catch (err) {
    return { ok: false, error: { code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) } };
  }
}

/** `match_location_required`: a location tag is required to be live. */
export function getMatchLocationRequired(supabase: Client): Promise<Result<boolean>> {
  return getFeatureFlag(supabase, MATCH_LOCATION_REQUIRED_FLAG);
}

/**
 * `match_proximity_required` (instant go-live addendum 3.1): with
 * `match_location_required` also on, an Arena (non-invite) start needs both
 * athletes on one mat. Seeded off; an older backend has no row (off).
 */
export function getMatchProximityRequired(supabase: Client): Promise<Result<boolean>> {
  return getFeatureFlag(supabase, MATCH_PROXIMITY_REQUIRED_FLAG);
}

/** `live_location_drift_check` (addendum 4.4): the client drift check while live. Seeded off. */
export function getLiveLocationDriftCheck(supabase: Client): Promise<Result<boolean>> {
  return getFeatureFlag(supabase, LIVE_LOCATION_DRIFT_CHECK_FLAG);
}

/**
 * The athlete's own `looking_for_ranked` as the server has it now: true /
 * false, or null when the read failed. The mobile live owner reads it after
 * a failed `go_live` refresh, because the server may have expired the live
 * session (`expire_stale_live_sessions`, live location fixes D7).
 */
export async function getMyLookingForRanked(supabase: Client, athleteId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("athletes")
      .select("looking_for_ranked")
      .eq("id", athleteId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { looking_for_ranked?: boolean | null }).looking_for_ranked === true;
  } catch {
    return null;
  }
}

function readingArgs(reading: LocationReading) {
  return { p_lat: reading.lat, p_lng: reading.lng, p_accuracy_m: reading.accuracyM };
}

/**
 * Every `report_match_presence` call is aborted after this long (review round
 * 3): a report never hangs a go-live. The live write itself is never aborted
 * (a client abort does not stop the server committing it).
 */
export const PRESENCE_REPORT_TIMEOUT_MS = 15_000;

/**
 * `report_match_presence` refusals the instant go-live migration adds for a
 * `go_live` reading sent with `p_captured_at` (addendum 3.4).
 */
export type GoLiveReportCode =
  | "accuracy_too_low"
  | "implausible_movement"
  | "tag_too_old"
  | "captured_at_invalid"
  | "not_active";

/**
 * The athlete-level Go Live reading (`p_context = 'go_live'`, no scope). The
 * server upserts one current reading per athlete and answers
 * `{ ok:true, verdict:'recorded', captured_at, tag_valid_until }`, or
 * `{ ok:false, code }` (`accuracy_too_low`, `implausible_movement`, and with
 * a capture time `tag_too_old` / `captured_at_invalid`), storing nothing.
 *
 * `capturedAt` (ms epoch): when the reading was taken, for a tag replayed
 * from the device store or the OS cache (instant go-live, rungs 2 and 3).
 * Omitted, the server uses its own receive time (a reading taken just now),
 * and the call has exactly the arguments an older backend accepts. With it,
 * an older backend answers `PGRST202` (no such signature): the caller must
 * then NOT retry without it (that would launder an old location as fresh)
 * and falls back to a fresh reading instead.
 */
export function reportGoLivePresence(
  supabase: Client,
  reading: LocationReading,
  opts: { capturedAt?: number | null } = {},
): Promise<InviteResult<PresenceResult>> {
  const at = opts.capturedAt;
  const capturedAt = typeof at === "number" && Number.isFinite(at) ? new Date(at).toISOString() : null;
  return rpc(
    supabase,
    "report_match_presence",
    {
      ...readingArgs(reading),
      p_context: "go_live",
      p_challenge_id: null,
      p_invite_id: null,
      ...(capturedAt ? { p_captured_at: capturedAt } : {}),
    },
    parsePresence,
    { timeoutMs: PRESENCE_REPORT_TIMEOUT_MS },
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
    { timeoutMs: PRESENCE_REPORT_TIMEOUT_MS },
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
    { timeoutMs: PRESENCE_REPORT_TIMEOUT_MS },
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

// ---------------------------------------------------------------------------
// Location event telemetry (016 addendum: live location fixes, section 3.2)
// ---------------------------------------------------------------------------

/** `athlete_location_events.event` (`drift_check` / `drift_prompt`: instant go-live 3.11). */
export type LocationEventKind = "go_live_attempt" | "match_start" | "drift_check" | "drift_prompt";

/** `athlete_location_events.outcome` (the server's allowlist). */
export type LocationEventOutcome =
  | "ok"
  | "permission_denied"
  | "dismissed"
  | "timeout"
  | "unavailable"
  | "accuracy_too_low"
  | "implausible_movement"
  | "location_required"
  | "error"
  // Instant go-live (3.11).
  | "drifted"
  | "retagged"
  | "went_offline"
  | "tag_too_old";

/** Outcomes an older backend's CHECK accepts in place of the new ones. */
const LEGACY_OUTCOME: Partial<Record<LocationEventOutcome, LocationEventOutcome>> = {
  tag_too_old: "location_required",
};

export interface LocationEventInput {
  event: LocationEventKind;
  outcome: LocationEventOutcome;
  /** `go_live_attempt` only: which rung of the location ladder produced the tag. */
  source?: GoLiveTagSource | null;
  /** The reading the flow ended with, when there was one. */
  reading?: LocationReading | null;
  /** Required for `match_start`, absent for `go_live_attempt`. */
  matchId?: string | null;
  /** The client build, at most 32 characters (the server truncates longer). */
  appVersion?: string | null;
  /** Device time at the end of the flow. */
  occurredAt?: Date | null;
}

/** The `log_location_event` answer: `logged` false when rate capped or a duplicate. */
export interface LocationEventLogged {
  logged: boolean;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Log one location attempt (`log_location_event`). Fire and forget: the
 * caller never awaits it on a UI path. Never throws; a refusal (validation,
 * not a participant, the RPC missing on an older backend) comes back as
 * `{ ok:false, error }`. A reading with a non-finite coordinate is sent
 * without coordinates rather than refused by the server.
 *
 * `source` is sent as `p_source` only for a `go_live_attempt` that has one.
 * An older backend without that parameter answers `PGRST202`; the event is
 * then logged once more without it (and with an outcome its CHECK knows).
 */
export async function logLocationEvent(
  supabase: Client,
  input: LocationEventInput,
): Promise<InviteResult<LocationEventLogged>> {
  const r = input.reading;
  const hasPoint = !!r && finite(r.lat) && finite(r.lng);
  const accuracy = r && finite(r.accuracyM) && r.accuracyM >= 0 ? r.accuracyM : null;
  const version = input.appVersion?.trim().slice(0, 32) || null;
  const at = input.occurredAt && Number.isFinite(input.occurredAt.getTime()) ? input.occurredAt.toISOString() : null;
  const source = input.event === "go_live_attempt" ? (input.source ?? null) : null;
  const args = {
    p_event: input.event,
    p_outcome: input.outcome,
    p_lat: hasPoint ? r!.lat : null,
    p_lng: hasPoint ? r!.lng : null,
    p_accuracy_m: hasPoint ? accuracy : null,
    p_match_id: input.event === "match_start" ? (input.matchId ?? null) : null,
    p_app_version: version,
    p_occurred_at: at,
  };
  const parse = (d: unknown) => (obj(d) ? { logged: obj(d)?.logged === true } : null);
  // Newer than the generated types until jr_be migration 20261002100100 lands.
  const fn = "log_location_event" as never;
  const first = await rpc(supabase, fn, source ? { ...args, p_source: source } : args, parse);
  if (first.ok || !source || !isMissingRpcSignature(first.error)) return first;
  return rpc(supabase, fn, { ...args, p_outcome: LEGACY_OUTCOME[input.outcome] ?? input.outcome }, parse);
}

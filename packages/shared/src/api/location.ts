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
/**
 * A close band id. The server derives ids from its configured edges (jr_be
 * spec 023 section 5.2: `under_1km`, `under_3km`, `under_1500m`, ...), so the
 * client accepts any `under_<N>m` / `under_<N>km` instead of an allowlist.
 */
export type ArenaCloseBand = `under_${string}`;
export type ArenaDistanceBand = "on_the_mat" | ArenaCloseBand;

/** One live athlete in Online & close. Never a distance, only the band. */
export interface ArenaCloseRow {
  athleteId: string;
  band: ArenaCloseBand;
  /** The band's upper edge in meters (`band_max_m`, else read from the id). */
  bandMaxM: number;
  /**
   * The server lets the viewer challenge this athlete (jr_be spec 023
   * `can_challenge`). True only when the server sent exactly `true`; a server
   * from before 023 sends nothing, so close rows stay unchallengeable there.
   */
  canChallenge: boolean;
}

/** The configured ranges (jr_be spec 023 `ranges`), for copy only. */
export interface ArenaRanges {
  /** About how far "on the mat" reaches (base plus the GPS allowance cap). */
  sameMatM: number;
  /** The Online & close radius. */
  closeRadiusM: number;
  bandEdgesM: number[];
}

export interface ArenaNearby {
  mode: ArenaNearbyMode;
  /** Athletes on the viewer's mat (the match-start proximity rule); always challengeable. */
  onTheMat: string[];
  /** Live athletes within the close radius who are not on the mat, banded, never a distance. */
  close: ArenaCloseRow[];
  /** Null when the server sent none (before spec 023) or sent a malformed one. */
  ranges: ArenaRanges | null;
}

const NEARBY_MODES: ReadonlySet<string> = new Set(["flag_off", "no_location", "nearby"]);
const CLOSE_BAND_RE = /^under_(\d+)(m|km)$/;

function positiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/** The meters a band id stands for (`under_2km` is 2000), or null when malformed. */
export function closeBandMeters(band: string): number | null {
  const m = CLOSE_BAND_RE.exec(band);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return m[2] === "km" ? n * 1000 : n;
}

function parseRanges(v: unknown): ArenaRanges | null {
  const r = obj(v);
  if (!r) return null;
  const sameMatM = positiveInt(r.same_mat_m);
  const closeRadiusM = positiveInt(r.close_radius_m);
  const edges = Array.isArray(r.band_edges_m) ? r.band_edges_m.map(positiveInt) : null;
  if (sameMatM === null || closeRadiusM === null || !edges || edges.length === 0) return null;
  if (edges.some((e) => e === null)) return null;
  return { sameMatM, closeRadiusM, bandEdgesM: edges as number[] };
}

/**
 * Parse `get_arena_nearby()`. A refusal (`{ ok:false, code:'not_active' }`)
 * or an unknown shape is null (the caller falls back to today's list).
 *
 * Tolerant of both server generations (jr_be spec 023 section 8.1): a close
 * row is kept whenever its band reads `under_<N>m` or `under_<N>km` (a row
 * with a malformed band, or no athlete id, is dropped rather than guessed);
 * `band_max_m` is used when it is a positive integer, else the meters come
 * from the id; `can_challenge` is true only when it is exactly `true`; and
 * `ranges` is null unless every field is valid.
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
  const close: ArenaCloseRow[] = [];
  for (const row of Array.isArray(o.close) ? o.close : []) {
    const r = obj(row);
    const id = str(r?.athlete_id);
    const band = str(r?.distance_band);
    if (!id || !band) continue;
    const fromId = closeBandMeters(band);
    if (fromId === null) continue;
    close.push({
      athleteId: id,
      band: band as ArenaCloseBand,
      bandMaxM: positiveInt(r?.band_max_m) ?? fromId,
      canChallenge: r?.can_challenge === true,
    });
  }
  return { mode: mode as ArenaNearbyMode, onTheMat, close, ranges: parseRanges(o.ranges) };
}

/**
 * Which live athletes are on the viewer's mat and which are close (bands
 * only). Mode `flag_off` / `no_location` carries empty lists; the Arena then
 * shows today's list. Never throws.
 */
export function getArenaNearby(supabase: Client): Promise<InviteResult<ArenaNearby>> {
  return rpc(supabase, "get_arena_nearby", {}, parseArenaNearby);
}

/**
 * What a band shows, from its meters: whole kilometers read `< N km`, else
 * `< N m` (500 is `< 500 m`, 1000 `< 1 km`, 1500 `< 1500 m`, 3000 `< 3 km`).
 * Reproduces the labels of the server before spec 023 exactly.
 */
export function formatBandLabel(meters: number): string {
  return meters % 1000 === 0 ? `< ${meters / 1000} km` : `< ${meters} m`;
}

/** What VoiceOver reads for a band: `under 1 kilometer`, `under 3 kilometers`, `under 500 meters`. */
export function formatBandSpoken(meters: number): string {
  if (meters % 1000 === 0) {
    const km = meters / 1000;
    return `under ${km} ${km === 1 ? "kilometer" : "kilometers"}`;
  }
  return `under ${meters} ${meters === 1 ? "meter" : "meters"}`;
}

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

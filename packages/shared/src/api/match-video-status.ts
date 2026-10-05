import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { mapPostgrestError, type DomainError, type Result } from "./errors";
import { isUuid } from "../utils/shared";

type Client = SupabaseClient<Database>;

/**
 * The server's one status document for a match's film (jr_be-1qz.20,
 * `get_match_video_status`, contract: jr_be
 * `specs/013-chunked-video-pipeline/INTEGRATION.md` section 11.2).
 *
 * Every athlete of the match and its timekeeper read the SAME document (only
 * `server_now` moves; the timekeeper's `reels[]` are reduced to
 * `{athlete_id, state}`), so every phone tells the same story. The client
 * only adds "Your angle" from this phone's local upload job (COPY-DECK v2.2
 * contradiction rule 1).
 *
 * Fusion fields (section 12: the wait gate, `angles_used`, `late_angle_until`,
 * the election) are NULL while `feature_flags.multi_angle_highlights_enabled`
 * is off, which it is in prod. Parsing keeps them null; copy that would claim
 * a multi-angle highlight is gated on them in the mobile copy layer.
 */

export type MatchVideoPhase = "recording" | "collecting" | "waiting_for_angle" | "building" | "ready" | "no_film";

export type MatchVideoPhaseReason =
  | "match_cancelled"
  | "no_video_yet"
  | "nobody_recorded"
  | "awaiting_first_angle"
  | "window_closed"
  | "none_usable";

export type MatchVideoAngleState =
  | "not_recording"
  | "waiting_for_phone"
  | "uploading"
  | "upload_paused"
  | "processing"
  | "ready"
  | "no_match"
  | "failed"
  | "abandoned";

export type MatchVideoReelState = "not_started" | "building" | "ready" | "failed" | "none" | "none_dominant_fallback";

export interface MatchVideoAngle {
  recorder_athlete_id: string;
  /** Initial + last name ("M. Reyes"), else the display name. */
  recorder_name_short: string;
  role: "competitor" | "timekeeper";
  /** null = no intent row (an old build). */
  intends_to_record: boolean | null;
  video_id: string | null;
  state: MatchVideoAngleState;
  /** 0..100 while uploading / paused with a declared total. */
  progress_pct: number | null;
  bytes_confirmed: number | null;
  bytes_total: number | null;
  upload_transport: string | null;
  last_heartbeat_at: string | null;
  error_code: string | null;
  /** Seconds, ready only. */
  duration_s: number | null;
  /** The server-elected primary angle (jr_be-1qz.10). */
  is_primary: boolean;
  /** In the dispatched build's `angles_used`; null until dispatched (always null pre-fusion). */
  used: boolean | null;
}

export interface MatchVideoReel {
  athlete_id: string;
  highlight_id: string | null;
  state: MatchVideoReelState;
  none_reason: "highlights_disabled" | "no_clear_moment" | "not_enough_film" | null;
  version: number | null;
  origin: string | null;
  ready_at: string | null;
}

export interface MatchVideoStatus {
  match_id: string;
  match_status: string;
  match_ended_at: string | null;
  /** The server's clock at the read: countdowns are `deadline - (server_now + time since fetch)`. */
  server_now: string | null;
  phase: MatchVideoPhase;
  phase_reason: MatchVideoPhaseReason | null;
  phase_since: string | null;
  wait_deadline_at: string | null;
  /** null = no gate row (fusion not live for this match). */
  wait_extended: boolean | null;
  dispatched_at: string | null;
  dispatch_reason: string | null;
  late_angle_until: string | null;
  film_window_until: string | null;
  no_video_grace_until: string | null;
  angles_expected: number;
  angles_pending: number;
  angles_ready: number;
  angles_used: string[] | null;
  angles_used_count: number | null;
  angles: MatchVideoAngle[];
  reels: MatchVideoReel[];
  event_seq: number | null;
}

const PHASES = new Set<MatchVideoPhase>(["recording", "collecting", "waiting_for_angle", "building", "ready", "no_film"]);
const ANGLE_STATES = new Set<MatchVideoAngleState>([
  "not_recording",
  "waiting_for_phone",
  "uploading",
  "upload_paused",
  "processing",
  "ready",
  "no_match",
  "failed",
  "abandoned",
]);
const REEL_STATES = new Set<MatchVideoReelState>(["not_started", "building", "ready", "failed", "none", "none_dominant_fallback"]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function parseAngle(raw: Record<string, unknown>): MatchVideoAngle | null {
  const id = str(raw.recorder_athlete_id);
  const state = raw.state as MatchVideoAngleState;
  // An angle state this build does not know is dropped rather than guessed:
  // a future state must not render as something it is not.
  if (!id || !ANGLE_STATES.has(state)) return null;
  return {
    recorder_athlete_id: id,
    recorder_name_short: str(raw.recorder_name_short) ?? "",
    role: raw.role === "timekeeper" ? "timekeeper" : "competitor",
    intends_to_record: bool(raw.intends_to_record),
    video_id: str(raw.video_id),
    state,
    progress_pct: num(raw.progress_pct),
    bytes_confirmed: num(raw.bytes_confirmed),
    bytes_total: num(raw.bytes_total),
    upload_transport: str(raw.upload_transport),
    last_heartbeat_at: str(raw.last_heartbeat_at),
    error_code: str(raw.error_code),
    duration_s: num(raw.duration_s),
    is_primary: raw.is_primary === true,
    used: bool(raw.used),
  };
}

function parseReel(raw: Record<string, unknown>): MatchVideoReel | null {
  const id = str(raw.athlete_id);
  if (!id) return null;
  const state = REEL_STATES.has(raw.state as MatchVideoReelState) ? (raw.state as MatchVideoReelState) : "not_started";
  const reason = raw.none_reason;
  return {
    athlete_id: id,
    highlight_id: str(raw.highlight_id),
    state,
    none_reason:
      reason === "highlights_disabled" || reason === "no_clear_moment" || reason === "not_enough_film" ? reason : null,
    version: num(raw.version),
    origin: str(raw.origin),
    ready_at: str(raw.ready_at),
  };
}

function records(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

/**
 * Normalise the RPC's jsonb into `MatchVideoStatus`, or null when it is not a
 * status document this build can read (an unknown phase is not guessed).
 * Exported for tests and for fixtures.
 */
export function parseMatchVideoStatus(data: unknown): MatchVideoStatus | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const phase = d.phase as MatchVideoPhase;
  const matchId = str(d.match_id);
  if (!matchId || !PHASES.has(phase)) return null;
  const used = Array.isArray(d.angles_used) ? d.angles_used.filter((x): x is string => typeof x === "string") : null;
  return {
    match_id: matchId,
    match_status: str(d.match_status) ?? "",
    match_ended_at: str(d.match_ended_at),
    server_now: str(d.server_now),
    phase,
    phase_reason: (str(d.phase_reason) as MatchVideoPhaseReason | null) ?? null,
    phase_since: str(d.phase_since),
    wait_deadline_at: str(d.wait_deadline_at),
    wait_extended: bool(d.wait_extended),
    dispatched_at: str(d.dispatched_at),
    dispatch_reason: str(d.dispatch_reason),
    late_angle_until: str(d.late_angle_until),
    film_window_until: str(d.film_window_until),
    no_video_grace_until: str(d.no_video_grace_until),
    angles_expected: num(d.angles_expected) ?? 0,
    angles_pending: num(d.angles_pending) ?? 0,
    angles_ready: num(d.angles_ready) ?? 0,
    angles_used: used,
    angles_used_count: num(d.angles_used_count),
    angles: records(d.angles).map(parseAngle).filter((a): a is MatchVideoAngle => a !== null),
    reels: records(d.reels).map(parseReel).filter((r): r is MatchVideoReel => r !== null),
    event_seq: num(d.event_seq),
  };
}

const NOT_FOUND: DomainError = { code: "MATCH_NOT_FOUND", message: "Match not found." };

/**
 * `get_match_video_status(p_match_id)`: the caller must be a participant or
 * the match's timekeeper (42501 `not_participant` otherwise, also for an
 * unknown match). Never throws. A transport error is an error, never an
 * empty status (supabase-js resolves, it does not reject).
 */
export async function getMatchVideoStatus(supabase: Client, matchId: string): Promise<Result<MatchVideoStatus>> {
  if (!isUuid(matchId)) return { ok: false, error: NOT_FOUND };
  try {
    const { data, error } = await supabase.rpc("get_match_video_status", { p_match_id: matchId });
    if (error) {
      if (error.hint === "not_participant") {
        return { ok: false, error: { code: "NOT_PARTICIPANT", message: "You are not a participant in this match.", raw: error } };
      }
      return { ok: false, error: mapPostgrestError(error, "match_video_status") };
    }
    const status = parseMatchVideoStatus(data);
    if (!status) return { ok: false, error: { code: "UNKNOWN", message: "Unreadable match video status." } };
    return { ok: true, data: status };
  } catch (err) {
    return { ok: false, error: { code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) } };
  }
}

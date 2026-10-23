import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  domainErrorFromHint,
  mapPostgrestError,
  type DomainError,
  type DomainErrorCode,
} from "./errors";

type Client = SupabaseClient<Database>;

/**
 * Typed wrappers for the timekeeper-mode RPCs (jits_web specs/timekeeper-mode
 * ARCHITECTURE 2.4; backend contract jr_be specs/024-timekeeper-mode sections
 * 4 and 5). Every timekeeper-mode read and write goes through here (clean-code
 * rule M-R7); none of it is reached by a two-athlete (flag-OFF) match.
 *
 * Errors: a guard failure RAISEs with a HINT, a business outcome of the
 * request RPCs returns `{ok:false, code}`. Both become a `DomainError` with
 * one code per server refusal (`TK_CODES` below, then the shared hint table),
 * so a screen branches on `error.code` and shows the copy deck string for it
 * (spec 14.9 X1, ARCHITECTURE M-R4). The `message` is the deck's own string
 * where the deck has one for that refusal on its own (TK-T6, TK-T8, TK-ED7,
 * TK-P8, TK-P9, TK-K9, TK-RC4; pinned to `timekeeper-copy.ts` by the mobile
 * test `timekeeper-copy.test.ts`), else a plain fallback that no
 * timekeeper-mode screen renders (the mobile guard
 * `timekeeper-mode-guard.test.ts`, "M-R4").
 */

/** A `DomainError` from these wrappers, with the extra detail some refusals carry. */
export interface TimekeeperDomainError extends DomainError {
  /** `timekeeper_busy` on a request or an accept: what the person is busy as (TK-P8, TK-P9). */
  busyAs?: "timekeeper" | "competitor";
  /** `request_already_open`: the request that is open (TK-P20). */
  requestId?: string;
}

export type TkResult<T> = { ok: true; data: T } | { ok: false; error: TimekeeperDomainError };

/**
 * The copy deck strings a refusal's `message` carries (COPY-DECK.md; the same
 * words as `TIMEKEEPER_COPY` in the app's `lib/match-flow/timekeeper-copy.ts`,
 * which this package cannot import). Exported for that pinning test only.
 */
export const TIMEKEEPER_DECK_MESSAGES = {
  /** TK-T6: a request that is no longer open. */
  requestClosed: "This request is no longer open.",
  /** TK-T8: consent missing (D12). */
  consentRequired: "You need to allow recording to timekeep.",
  /** TK-ED7: an edit refused or failed. */
  editRefused: "Couldn't change the result",
  /** TK-P8: busy, timekeeping another match. */
  busyTimekeeping: "Timekeeping another match",
  /** TK-P9: busy, competing in their own match. */
  busyCompeting: "Running their own match",
  /** TK-K9: the timekeeper always records. */
  mustRecord: "Timekeepers always record this match.",
  /** TK-RC4 (title): the result changed under a confirm. */
  resultChanged: "The result just changed",
} as const;

const DECK = TIMEKEEPER_DECK_MESSAGES;

/**
 * Timekeeper-mode refusals, by the server's HINT or `{ok:false, code}`. A
 * message is a deck string where the deck has one for that refusal on its own
 * (`DECK`); the others are plain fallbacks a timekeeper-mode screen never
 * renders: it shows the deck string for the code, with its names.
 */
const TK_CODES: Record<string, { code: DomainErrorCode; message: string }> = {
  not_timekeeper_mode: { code: "NOT_TIMEKEEPER_MODE", message: "This match has no timekeeper." },
  not_timekeeper: { code: "NOT_TIMEKEEPER", message: "Only the timekeeper can do that." },
  timekeeper_required: { code: "TIMEKEEPER_REQUIRED", message: "This match needs a timekeeper first." },
  timekeeper_already_seated: { code: "TIMEKEEPER_ALREADY_SEATED", message: "This match already has a timekeeper." },
  timekeeper_is_competitor: { code: "TIMEKEEPER_IS_COMPETITOR", message: "An athlete in the match can't timekeep it." },
  timekeeper_unavailable: { code: "TIMEKEEPER_UNAVAILABLE", message: "That person can't timekeep this match." },
  // TK-P8; `busy_as: competitor` reads TK-P9 (`fromCode`).
  timekeeper_busy: { code: "TIMEKEEPER_BUSY", message: DECK.busyTimekeeping },
  athlete_in_timekeeper_match: { code: "ATHLETE_IN_TIMEKEEPER_MATCH", message: DECK.busyCompeting },
  timekeeper_not_recording: { code: "TIMEKEEPER_NOT_RECORDING", message: "The timekeeper's camera is not recording." },
  timekeeper_must_record: { code: "TIMEKEEPER_MUST_RECORD", message: DECK.mustRecord },
  athletes_not_ready: { code: "ATHLETES_NOT_READY", message: "Both athletes need to be ready." },
  request_already_open: { code: "REQUEST_ALREADY_OPEN", message: "Someone has already been asked." },
  request_closed: { code: "REQUEST_CLOSED", message: DECK.requestClosed },
  not_requested: { code: "NOT_REQUESTED", message: "This request was not sent to you." },
  consent_required: { code: "CONSENT_REQUIRED", message: DECK.consentRequired },
  match_cancelled: { code: "MATCH_CANCELLED", message: "This match was cancelled." },
  match_not_pending: { code: "MATCH_NOT_PENDING", message: "This match has already started." },
  match_not_live: { code: "MATCH_NOT_LIVE", message: "The match clock is not running." },
  match_not_in_progress: { code: "MATCH_NOT_IN_PROGRESS", message: "The match is not in progress." },
  result_owed: { code: "RESULT_OWED", message: "Record the result before you leave." },
  result_changed: { code: "RESULT_CHANGED", message: DECK.resultChanged },
  edit_window_closed: { code: "EDIT_WINDOW_CLOSED", message: DECK.editRefused },
  edit_closed_disputed: { code: "EDIT_CLOSED_DISPUTED", message: DECK.editRefused },
  edit_closed_confirmed: { code: "EDIT_CLOSED_CONFIRMED", message: DECK.editRefused },
  edit_closed_admin: { code: "EDIT_CLOSED_ADMIN", message: DECK.editRefused },
  weight_check_not_required: { code: "WEIGHT_CHECK_NOT_REQUIRED", message: "This match has no timekeeper weight check." },
  not_available_in_timekeeper_mode: {
    code: "NOT_AVAILABLE_IN_TIMEKEEPER_MODE",
    message: "That is not available in a timekeeper match.",
  },
  use_end_match_clock: { code: "USE_END_MATCH_CLOCK", message: "Only the timekeeper ends the clock." },
  no_open_review: { code: "NO_OPEN_REVIEW", message: "This match is no longer waiting for review." },
};

function fromCode(code: unknown, extra: Record<string, unknown> = {}): TimekeeperDomainError {
  const key = typeof code === "string" ? code : "";
  const mapped = Object.prototype.hasOwnProperty.call(TK_CODES, key) ? TK_CODES[key] : null;
  const error: TimekeeperDomainError = mapped ? { ...mapped } : domainErrorFromHint(key, key || null);
  if (extra.busy_as === "timekeeper" || extra.busy_as === "competitor") {
    error.busyAs = extra.busy_as;
    // TK-P8 or TK-P9, the picker row's own words for each.
    error.message = extra.busy_as === "timekeeper" ? DECK.busyTimekeeping : DECK.busyCompeting;
  }
  if (typeof extra.request_id === "string") error.requestId = extra.request_id;
  return error;
}

/** A raised refusal: the timekeeper-mode HINT first (whatever its SQLSTATE), then the shared mapping. */
export function mapTimekeeperError(error: PostgrestError): TimekeeperDomainError {
  const hint = error.hint ?? "";
  if (Object.prototype.hasOwnProperty.call(TK_CODES, hint)) return { ...TK_CODES[hint], raw: error };
  const shared = domainErrorFromHint(hint, null);
  if (shared.code !== "UNKNOWN") return { ...shared, raw: error };
  return mapPostgrestError(error);
}

const UNEXPECTED: TimekeeperDomainError = { code: "UNKNOWN", message: "Unexpected timekeeper response." };

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : []);
function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * Run an RPC and shape its payload. A raised error maps through
 * `mapTimekeeperError`; a payload with `ok: false` maps its `code`; a payload
 * the parser cannot read is UNKNOWN.
 */
async function call<T>(
  run: () => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  parse: (data: unknown) => T | null,
): Promise<TkResult<T>> {
  const { data, error } = await run();
  if (error) return { ok: false, error: mapTimekeeperError(error) };
  if (isRow(data) && data.ok === false) return { ok: false, error: fromCode(data.code, data) };
  const parsed = parse(data);
  if (parsed === null) return { ok: false, error: { ...UNEXPECTED } };
  return { ok: true, data: parsed };
}

// ---------------------------------------------------------------------------
// Match state (get_timekeeper_match_state, jr_be 024 5.2)
// ---------------------------------------------------------------------------

export type AthleteCheckStatus = "pending" | "confirmed" | "flagged" | "recheck";
export type TimekeeperCheckStatus = "confirmed" | "flagged" | "recheck";

/**
 * Why the timekeeper's Start is disabled, in the server's order
 * (`_tk_start_blockers`, the one `start_match` uses). An unknown code reads
 * as `other`, so a newer server's blocker still keeps Start disabled.
 */
export type TimekeeperStartBlocker =
  | "timekeeper_required"
  | "athletes_not_ready"
  | "weight_flagged"
  | "weight_recheck_pending"
  | "weight_check_pending"
  | "timekeeper_not_recording"
  | "other";

const START_BLOCKERS: readonly TimekeeperStartBlocker[] = [
  "timekeeper_required",
  "athletes_not_ready",
  "weight_flagged",
  "weight_recheck_pending",
  "weight_check_pending",
  "timekeeper_not_recording",
];

export interface TimekeeperMatchState {
  /** Athletes marked ready (`mark_match_ready`), oldest first. */
  ready: { athleteId: string; readyAt: string }[];
  /** Each athlete's check of the other, challenger first. */
  athleteChecks: { checkerId: string; subjectId: string; status: AthleteCheckStatus }[];
  /** The seated timekeeper's verdict per athlete; no row means not checked. */
  timekeeperChecks: { subjectId: string; status: TimekeeperCheckStatus }[];
  openRequest: {
    id: string;
    invitee: { id: string; displayName: string };
    requestedBy: string;
    expiresAt: string;
  } | null;
  /** The latest request, when it was declined or lapsed (TK-P21, TK-P22). */
  lastRequestOutcome: { status: "declined" | "expired"; inviteeName: string; at: string } | null;
  /** Null while nobody is seated. */
  presence: "online" | "offline" | null;
  offlineSince: string | null;
  /** In progress with the clock running and the timekeeper offline: when it becomes a no contest. */
  noContestAt: string | null;
  /** An open result-stall review (TK-D8, TK-D10). */
  reviewPending: boolean;
  /** The face-off, pause or offline timeout this match ends at (TK-D9). */
  timeoutAt: string | null;
  /**
   * Each athlete's rated weight, lbs, challenger first (BE-G3, PM26): the
   * challenge's `challenger_weight` / `opponent_weight` after any re-weigh,
   * which the match is rated on and which a timekeeper verdict must quote as
   * `weightSeen`. Null while the challenge holds none for that athlete. Never
   * the profile weight (`current_weight`), which a re-weigh leaves alone.
   * Empty on a backend without BE-G3. Read one with `ratedWeightOf`.
   */
  weights: { athleteId: string; weight: number | null }[];
  /** The timekeeper may still edit the result (A24). */
  editOpen: boolean;
  editClosesAt: string | null;
  startBlockers: TimekeeperStartBlocker[];
}

/** Shape `get_timekeeper_match_state`'s payload; null when it is not one. */
export function parseTimekeeperMatchState(data: unknown): TimekeeperMatchState | null {
  if (!isRow(data) || data.ok !== true) return null;
  const open = isRow(data.open_request) ? data.open_request : null;
  const invitee = open && isRow(open.invitee) ? open.invitee : null;
  const openId = str(open?.id);
  const last = isRow(data.last_request_outcome) ? data.last_request_outcome : null;
  const lastStatus = oneOf(last?.status, ["declined", "expired"] as const);
  return {
    ready: rows(data.ready).flatMap((r) => {
      const athleteId = str(r.athlete_id);
      return athleteId ? [{ athleteId, readyAt: str(r.ready_at) ?? "" }] : [];
    }),
    athleteChecks: rows(data.athlete_checks).flatMap((c) => {
      const checkerId = str(c.checker_id);
      const subjectId = str(c.subject_id);
      if (!checkerId || !subjectId) return [];
      const status = oneOf(c.status, ["pending", "confirmed", "flagged", "recheck"] as const) ?? "pending";
      return [{ checkerId, subjectId, status }];
    }),
    timekeeperChecks: rows(data.timekeeper_checks).flatMap((c) => {
      const subjectId = str(c.subject_id);
      const status = oneOf(c.status, ["confirmed", "flagged", "recheck"] as const);
      return subjectId && status ? [{ subjectId, status }] : [];
    }),
    openRequest:
      open && openId && invitee && str(invitee.id)
        ? {
            id: openId,
            invitee: { id: str(invitee.id) as string, displayName: str(invitee.display_name) ?? "" },
            requestedBy: str(open.requested_by) ?? "",
            expiresAt: str(open.expires_at) ?? "",
          }
        : null,
    lastRequestOutcome:
      last && lastStatus
        ? { status: lastStatus, inviteeName: str(last.invitee_name) ?? "", at: str(last.at) ?? "" }
        : null,
    presence: oneOf(data.presence, ["online", "offline"] as const),
    offlineSince: str(data.offline_since),
    noContestAt: str(data.no_contest_at),
    reviewPending: data.review_pending === true,
    timeoutAt: str(data.timeout_at),
    weights: rows(data.weights).flatMap((w) => {
      const athleteId = str(w.athlete_id);
      return athleteId ? [{ athleteId, weight: num(w.weight) }] : [];
    }),
    editOpen: data.edit_open === true,
    editClosesAt: str(data.edit_closes_at),
    startBlockers: (Array.isArray(data.start_blockers) ? data.start_blockers : []).map(
      (b) => oneOf(b, START_BLOCKERS) ?? "other",
    ),
  };
}

/**
 * One athlete's rated weight from the state (PM26), lbs; null when there is
 * no state yet, no entry for that athlete, or the challenge holds no weight
 * for them. Never falls back to the profile weight: the server refuses a
 * timekeeper verdict quoting anything else.
 */
export function ratedWeightOf(
  state: Pick<TimekeeperMatchState, "weights"> | null | undefined,
  athleteId: string,
): number | null {
  return state?.weights.find((w) => w.athleteId === athleteId)?.weight ?? null;
}

/**
 * The fast-changing timekeeper-mode state of a match, for its two athletes
 * and its seated timekeeper. `data` is null for a two-athlete match
 * (`not_timekeeper_mode`); a former timekeeper gets NOT_PARTICIPANT (TK-K17).
 */
export async function getTimekeeperMatchState(
  supabase: Client,
  matchId: string,
): Promise<TkResult<TimekeeperMatchState | null>> {
  const res = await call(
    () => supabase.rpc("get_timekeeper_match_state", { p_match_id: matchId }),
    parseTimekeeperMatchState,
  );
  if (!res.ok && res.error.code === "NOT_TIMEKEEPER_MODE") return { ok: true, data: null };
  return res;
}

// ---------------------------------------------------------------------------
// Picker and seat (BE-B, jr_be 024 4.3)
// ---------------------------------------------------------------------------

export interface TimekeeperCandidate {
  athleteId: string;
  displayName: string;
  avatarUrl: string | null;
  currentElo: number | null;
  isLive: boolean;
  /** Whose friend they are; null for a nearby athlete who is nobody's friend. */
  friendOf: "challenger" | "opponent" | "both" | null;
  /** The arena band (`on_the_mat` or a band id); never a distance. Null for a friend who is not nearby. */
  distanceBand: string | null;
}

export interface TimekeeperCandidates {
  friends: TimekeeperCandidate[];
  nearby: TimekeeperCandidate[];
}

function parseCandidate(r: Row): TimekeeperCandidate | null {
  const athleteId = str(r.athlete_id);
  if (!athleteId) return null;
  return {
    athleteId,
    displayName: str(r.display_name) ?? "",
    avatarUrl: str(r.avatar_url),
    currentElo: num(r.current_elo),
    isLive: r.is_live === true,
    friendOf: oneOf(r.friend_of, ["challenger", "opponent", "both"] as const),
    distanceBand: str(r.distance_band),
  };
}

export function parseTimekeeperCandidates(data: unknown): TimekeeperCandidates | null {
  if (!isRow(data) || data.ok !== true) return null;
  const list = (v: unknown) =>
    rows(v).flatMap((r) => {
      const c = parseCandidate(r);
      return c ? [c] : [];
    });
  return { friends: list(data.friends), nearby: list(data.nearby) };
}

/** Who either athlete of a pending timekeeper-mode match may ask (R3). */
export function getTimekeeperCandidates(supabase: Client, matchId: string): Promise<TkResult<TimekeeperCandidates>> {
  return call(() => supabase.rpc("get_timekeeper_candidates", { p_match_id: matchId }), parseTimekeeperCandidates);
}

/** Ask someone to timekeep (R4); the request lapses after 2 minutes. */
export function requestMatchTimekeeper(
  supabase: Client,
  matchId: string,
  inviteeId: string,
): Promise<TkResult<{ requestId: string; expiresAt: string }>> {
  return call(
    () => supabase.rpc("request_match_timekeeper", { p_match_id: matchId, p_invitee_id: inviteeId }),
    (d) => {
      if (!isRow(d) || d.ok !== true || !str(d.request_id)) return null;
      return { requestId: str(d.request_id) as string, expiresAt: str(d.expires_at) ?? "" };
    },
  );
}

/** Withdraw an open request (R5). */
export function cancelTimekeeperRequest(supabase: Client, requestId: string): Promise<TkResult<void>> {
  return call(
    () => supabase.rpc("cancel_timekeeper_request", { p_request_id: requestId }),
    (d) => (isRow(d) && d.ok === true ? undefined : null),
  );
}

/** The asked person accepts (seats them) or declines (R6). */
export function respondTimekeeperRequest(
  supabase: Client,
  requestId: string,
  accept: boolean,
): Promise<TkResult<{ matchId: string }>> {
  return call(
    () => supabase.rpc("respond_timekeeper_request", { p_request_id: requestId, p_accept: accept }),
    (d) => (isRow(d) && d.ok === true && str(d.match_id) ? { matchId: str(d.match_id) as string } : null),
  );
}

export type TimekeeperRequestStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled";

/** A request as its invitee sees it (the timekeep sheet; review tech M6). */
export interface TimekeeperRequest {
  requestId: string;
  matchId: string;
  /** A pending request past `expiresAt` reads `expired`. */
  status: TimekeeperRequestStatus;
  expiresAt: string;
  requestedBy: { id: string; displayName: string };
  /** Challenger first. */
  athletes: { id: string; displayName: string }[];
  durationSeconds: number | null;
}

export function parseTimekeeperRequest(data: unknown): TimekeeperRequest | null {
  if (!isRow(data) || data.ok !== true) return null;
  const requestId = str(data.request_id);
  const matchId = str(data.match_id);
  const status = oneOf(data.status, ["pending", "accepted", "declined", "expired", "cancelled"] as const);
  if (!requestId || !matchId || !status) return null;
  const by = isRow(data.requested_by) ? data.requested_by : {};
  return {
    requestId,
    matchId,
    status,
    expiresAt: str(data.expires_at) ?? "",
    requestedBy: { id: str(by.id) ?? "", displayName: str(by.display_name) ?? "" },
    athletes: rows(data.athletes).flatMap((a) =>
      str(a.id) ? [{ id: str(a.id) as string, displayName: str(a.display_name) ?? "" }] : [],
    ),
    durationSeconds: num(data.duration_seconds),
  };
}

/** The invitee's read of one request, any status (so a closed one shows TK-T6). */
export function getTimekeeperRequest(supabase: Client, requestId: string): Promise<TkResult<TimekeeperRequest>> {
  return call(() => supabase.rpc("get_timekeeper_request", { p_request_id: requestId }), parseTimekeeperRequest);
}

/** The newest request of a match that this viewer may read (M2). */
export interface LatestTimekeeperRequest {
  requestId: string;
  /** As stored: a pending request past `expiresAt` still reads `pending` here. */
  status: TimekeeperRequestStatus;
  inviteeId: string;
  inviteeName: string;
  expiresAt: string;
}

/**
 * The newest `match_timekeeper_requests` row of a match that the caller can
 * read (RLS, jr_be 024 2.3): for either athlete, every request of their
 * match; for an asked person, only the requests sent to them. Two readers
 * need it and neither has a request id: the asked person's sheet opened from
 * the TK-N1 push, whose `timekeep_href` carries only the match id (jr_be 024
 * section 8), and the athletes' picker after a pre-start drop-out, where the
 * newest request is the accepted one and names the timekeeper who left
 * (TK-D1; `get_timekeeper_match_state` reports only a declined or lapsed
 * latest request). Null when there is none.
 */
export async function getLatestTimekeeperRequest(
  supabase: Client,
  matchId: string,
): Promise<TkResult<LatestTimekeeperRequest | null>> {
  const { data, error } = await supabase
    .from("match_timekeeper_requests")
    .select("id, status, invitee_id, expires_at, invitee:athletes!match_timekeeper_requests_invitee_id_fkey(display_name)")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: mapTimekeeperError(error) };
  if (data == null) return { ok: true, data: null };
  const row = data as unknown as Row;
  const requestId = str(row.id);
  const inviteeId = str(row.invitee_id);
  const status = oneOf(row.status, ["pending", "accepted", "declined", "expired", "cancelled"] as const);
  if (!requestId || !inviteeId || !status) return { ok: false, error: { ...UNEXPECTED } };
  // An aliased to-one join: an object, or null when the athlete is not readable.
  const invitee = isRow(row.invitee) ? row.invitee : null;
  return {
    ok: true,
    data: {
      requestId,
      status,
      inviteeId,
      inviteeName: str(invitee?.display_name) ?? "",
      expiresAt: str(row.expires_at) ?? "",
    },
  };
}

/** The newest pending request sent to an athlete (M2, the asked person's listener). */
export interface IncomingTimekeeperRequest {
  requestId: string;
  matchId: string;
  /** As stored: a pending request past `expiresAt` still reads `pending` here, so the caller checks it. */
  expiresAt: string;
}

/**
 * The newest `pending` `match_timekeeper_requests` row sent to `athleteId`
 * (RLS admits the invitee, jr_be 024 2.3; served by the partial index on
 * `invitee_id` where pending). The asked person's app-wide listener reads it
 * on every channel (re)subscribe and on the return to the foreground, so a
 * request whose realtime INSERT was missed (app suspended, channel down)
 * still opens its sheet. Null when there is none.
 */
export async function getIncomingTimekeeperRequest(
  supabase: Client,
  athleteId: string,
): Promise<TkResult<IncomingTimekeeperRequest | null>> {
  const { data, error } = await supabase
    .from("match_timekeeper_requests")
    .select("id, match_id, expires_at")
    .eq("invitee_id", athleteId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: mapTimekeeperError(error) };
  if (data == null) return { ok: true, data: null };
  const row = data as unknown as Row;
  const requestId = str(row.id);
  const matchId = str(row.match_id);
  const expiresAt = str(row.expires_at);
  if (!requestId || !matchId || !expiresAt) return { ok: false, error: { ...UNEXPECTED } };
  return { ok: true, data: { requestId, matchId, expiresAt } };
}

/**
 * The seated timekeeper leaves (R21): before the start the athletes go back
 * to the picker (`pending`); while the clock runs it is a no contest
 * (`cancelled`); after the end it is refused (RESULT_OWED).
 */
export function leaveMatchAsTimekeeper(
  supabase: Client,
  matchId: string,
): Promise<TkResult<{ status: "pending" | "cancelled" }>> {
  return call(
    () => supabase.rpc("leave_match_as_timekeeper", { p_match_id: matchId }),
    (d) => {
      const status = isRow(d) ? oneOf(d.status, ["pending", "cancelled"] as const) : null;
      return status ? { status } : null;
    },
  );
}

// ---------------------------------------------------------------------------
// Face-off and start (BE-C, jr_be 024 4.4)
// ---------------------------------------------------------------------------

/**
 * An athlete marks ready (R12). By default it first confirms their check of
 * the opponent's weigh-in (the merged "Weight looks right, I'm ready").
 */
export function markMatchReady(
  supabase: Client,
  matchId: string,
  confirmOpponentWeight = true,
): Promise<TkResult<TimekeeperMatchState>> {
  return call(
    () => supabase.rpc("mark_match_ready", { p_match_id: matchId, p_confirm_opponent_weight: confirmOpponentWeight }),
    parseTimekeeperMatchState,
  );
}

export type TimekeeperWeightVerdict = "confirm" | "flag" | "withdraw";

/**
 * The timekeeper's verdict on one athlete's weigh-in (R11). `weightSeen` is
 * the weight on screen, which is that athlete's rated weight from the state
 * (`ratedWeightOf`, PM26), never the profile weight: confirm and flag are
 * refused WEIGHT_CHANGED when it is no longer that athlete's rated weight,
 * and always when it is left out.
 */
export function checkAthleteWeightAsTimekeeper(
  supabase: Client,
  params: { matchId: string; subjectId: string; verdict: TimekeeperWeightVerdict; weightSeen?: number | null },
): Promise<TkResult<TimekeeperMatchState>> {
  const args: { p_match_id: string; p_subject_id: string; p_verdict: string; p_weight_seen?: number } = {
    p_match_id: params.matchId,
    p_subject_id: params.subjectId,
    p_verdict: params.verdict,
  };
  if (params.weightSeen != null) args.p_weight_seen = params.weightSeen;
  return call(() => supabase.rpc("check_athlete_weight_as_timekeeper", args), parseTimekeeperMatchState);
}

/**
 * The timekeeper's Start (R13): the same `start_match` RPC, which dispatches
 * to the timekeeper branch. A refusal names the first Start blocker.
 */
export function startMatchAsTimekeeper(
  supabase: Client,
  matchId: string,
): Promise<TkResult<{ startedAt: string }>> {
  return call(
    () => supabase.rpc("start_match", { p_match_id: matchId }),
    (d) => (isRow(d) && str(d.started_at) ? { startedAt: str(d.started_at) as string } : null),
  );
}

// ---------------------------------------------------------------------------
// Live, end, edit, presence (BE-D, BE-D2, BE-E)
// ---------------------------------------------------------------------------

/** The timekeeper ends the clock (R15); the match stays in progress until the result. */
export function endMatchClock(
  supabase: Client,
  matchId: string,
  finalElapsedS: number,
): Promise<TkResult<{ endedAt: string; finalElapsedS: number }>> {
  return call(
    () => supabase.rpc("end_match_clock", { p_match_id: matchId, p_final_elapsed_s: Math.max(0, Math.round(finalElapsedS)) }),
    (d) => {
      if (!isRow(d) || d.ok !== true || !str(d.ended_at)) return null;
      return { endedAt: str(d.ended_at) as string, finalElapsedS: num(d.final_elapsed_s) ?? 0 };
    },
  );
}

/** The seated timekeeper's heartbeat (R23), every 15 s while seated and in the foreground. */
export function touchMatchTimekeeper(supabase: Client, matchId: string): Promise<TkResult<{ seenAt: string }>> {
  return call(
    () => supabase.rpc("touch_match_timekeeper", { p_match_id: matchId }),
    (d) => (isRow(d) && d.ok === true ? { seenAt: str(d.seen_at) ?? "" } : null),
  );
}

export interface EditMatchResultParams {
  matchId: string;
  result: "submission" | "draw";
  winnerId?: string | null;
  submissionTypeCode?: string | null;
  finishTimeSeconds?: number | null;
  /** The `result_edit_count` the form was opened on; a stale one is RESULT_CHANGED. */
  expectedEditCount: number;
}

/**
 * The timekeeper corrects a recorded result (R17, A8, A24): within 30
 * minutes of the result, before a dispute or both confirmations, never an
 * admin-recorded one. Resets both confirmations.
 */
export function editMatchResult(
  supabase: Client,
  params: EditMatchResultParams,
): Promise<TkResult<{ resultEditCount: number }>> {
  const args: {
    p_match_id: string;
    p_result: string;
    p_winner_id?: string;
    p_submission_type_code?: string;
    p_finish_time_seconds?: number;
    p_expected_edit_count: number;
  } = { p_match_id: params.matchId, p_result: params.result, p_expected_edit_count: params.expectedEditCount };
  if (params.winnerId) args.p_winner_id = params.winnerId;
  if (params.submissionTypeCode) args.p_submission_type_code = params.submissionTypeCode;
  if (params.finishTimeSeconds != null) args.p_finish_time_seconds = params.finishTimeSeconds;
  return call(
    () => supabase.rpc("edit_match_result", args),
    (d) => {
      const count = isRow(d) && d.ok === true ? num(d.result_edit_count) : null;
      return count === null ? null : { resultEditCount: count };
    },
  );
}

// ---------------------------------------------------------------------------
// The timekeeper's own match on Home and the header (BE-G, A20, A24)
// ---------------------------------------------------------------------------

export interface MyTimekeepingMatch {
  matchId: string;
  status: "pending" | "in_progress" | "completed";
  startedAt: string | null;
  endedAt: string | null;
  /** Challenger first. */
  athletes: { athleteId: string; displayName: string }[];
  reviewPending: boolean;
  /** Completed inside the 30-minute edit window (TK-H8, TK-H9). */
  editOpen: boolean;
  editClosesAt: string | null;
}

export function parseMyTimekeepingMatch(data: unknown): MyTimekeepingMatch | null {
  if (!isRow(data)) return null;
  const matchId = str(data.match_id);
  const status = oneOf(data.status, ["pending", "in_progress", "completed"] as const);
  if (!matchId || !status) return null;
  return {
    matchId,
    status,
    startedAt: str(data.started_at),
    endedAt: str(data.ended_at),
    athletes: rows(data.athletes).flatMap((a) =>
      str(a.athlete_id) ? [{ athleteId: str(a.athlete_id) as string, displayName: str(a.display_name) ?? "" }] : [],
    ),
    reviewPending: data.review_pending === true,
    editOpen: data.edit_open === true,
    editClosesAt: str(data.edit_closes_at),
  };
}

/**
 * The caller's in-flight timekeeper-mode match (seated and pending, in
 * progress within the resume window, or completed with the edit window
 * open); null when there is none.
 */
export async function getMyTimekeepingMatch(supabase: Client): Promise<TkResult<MyTimekeepingMatch | null>> {
  const { data, error } = await supabase.rpc("get_my_timekeeping_match");
  if (error) return { ok: false, error: mapTimekeeperError(error) };
  if (data == null) return { ok: true, data: null };
  const parsed = parseMyTimekeepingMatch(data);
  return parsed ? { ok: true, data: parsed } : { ok: false, error: { ...UNEXPECTED } };
}

// ---------------------------------------------------------------------------
// Admin > Timekeeper reviews (BE-E, A27)
// ---------------------------------------------------------------------------

export interface TimekeeperReview {
  matchId: string;
  flaggedAt: string;
  /** Challenger first. */
  athletes: { id: string; displayName: string }[];
  timekeeper: { id: string; displayName: string } | null;
  endedAt: string | null;
  finalElapsedS: number | null;
  durationSeconds: number | null;
}

export function parseTimekeeperReviews(data: unknown): TimekeeperReview[] | null {
  if (!Array.isArray(data)) return null;
  return rows(data).flatMap((r) => {
    const matchId = str(r.match_id);
    if (!matchId) return [];
    const tk = isRow(r.timekeeper) && str(r.timekeeper.id) ? r.timekeeper : null;
    return [
      {
        matchId,
        flaggedAt: str(r.flagged_at) ?? "",
        athletes: rows(r.athletes).flatMap((a) =>
          str(a.id) ? [{ id: str(a.id) as string, displayName: str(a.display_name) ?? "" }] : [],
        ),
        timekeeper: tk ? { id: str(tk.id) as string, displayName: str(tk.display_name) ?? "" } : null,
        endedAt: str(r.ended_at),
        finalElapsedS: num(r.final_elapsed_s),
        durationSeconds: num(r.duration_seconds),
      },
    ];
  });
}

/** The open result-stall reviews, oldest first (admins and founders only). */
export function adminListTimekeeperReviews(supabase: Client): Promise<TkResult<TimekeeperReview[]>> {
  return call(() => supabase.rpc("admin_list_timekeeper_reviews"), parseTimekeeperReviews);
}

export type AdminResolveTimekeeperReviewParams =
  | { matchId: string; action: "void"; note?: string | null }
  | {
      matchId: string;
      action: "record";
      result: "submission" | "draw";
      winnerId?: string | null;
      submissionTypeCode?: string | null;
      finishTimeSeconds?: number | null;
      note?: string | null;
    };

/** An admin records (rating applied, never editable) or voids (a no contest) a stalled result. */
export function adminResolveTimekeeperReview(
  supabase: Client,
  params: AdminResolveTimekeeperReviewParams,
): Promise<TkResult<{ action: "record" | "void"; matchId: string }>> {
  const args: {
    p_match_id: string;
    p_action: string;
    p_result?: string;
    p_winner_id?: string;
    p_submission_type_code?: string;
    p_finish_time_seconds?: number;
    p_note?: string;
  } = { p_match_id: params.matchId, p_action: params.action };
  if (params.note) args.p_note = params.note;
  if (params.action === "record") {
    args.p_result = params.result;
    if (params.winnerId) args.p_winner_id = params.winnerId;
    if (params.submissionTypeCode) args.p_submission_type_code = params.submissionTypeCode;
    if (params.finishTimeSeconds != null) args.p_finish_time_seconds = params.finishTimeSeconds;
  }
  return call(
    () => supabase.rpc("admin_resolve_timekeeper_review", args),
    (d) => {
      const action = isRow(d) ? oneOf(d.action, ["record", "void"] as const) : null;
      return isRow(d) && d.ok !== false && action ? { action, matchId: str(d.match_id) ?? params.matchId } : null;
    },
  );
}

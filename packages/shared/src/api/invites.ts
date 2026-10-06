/**
 * Invites (jr_be spec 016, contract section 4). Typed wrappers over the
 * invite RPCs. Every call returns `Result<T>` and never throws: a RAISE comes
 * back as `{ ok:false, error }` (branch on `error.hint`, kept on `hint`), and a
 * returned `{ok:false, code}` JSON is a successful call whose data says so.
 *
 * RPC names are checked against the generated `Database` types; the jsonb
 * results are parsed by hand below (the generated return type is `Json`).
 */
import type { ClaimFailureCode, StartBlockedReason } from "../utils/invite-copy";

import {
  num,
  obj,
  parsePresence,
  rpc,
  str,
  type Client,
  type InviteResult,
  type PresenceResult,
} from "./invite-rpc";

export type { InviteResult, InviteRpcError, PresenceResult } from "./invite-rpc";

// ---------------------------------------------------------------------------
// Shapes

export interface InviterCard {
  athlete_id: string;
  first_name: string | null;
  last_initial: string | null;
  display_name: string;
  avatar_url: string | null;
  current_elo: number;
  weight_lbs: number | null;
}

export interface ChallengeInvite {
  invite_id: string;
  kind: "challenge";
  token: string;
  url: string;
  scheme_url: string;
  short_code: string;
  short_code_display: string;
  link_expires_at: string;
  code_expires_at: string;
}

export interface PersonalInvite {
  invite_id: string;
  kind: "join";
  token: string;
  url: string;
  scheme_url: string;
  created_at: string;
}

export interface RefreshedCode {
  invite_id: string;
  short_code: string;
  short_code_display: string;
  code_expires_at: string;
}

export interface ProximityResult {
  verdict: "passed" | "failed" | "waiting";
  reason: "far" | "stale" | "accuracy" | null;
  distance_m: number | null;
}

export type ClaimResult =
  | {
      ok: true;
      result: "started" | "booked" | "already_claimed";
      invite_id: string;
      challenge_id: string;
      match_id: string | null;
      booking_expires_at: string | null;
      inviter: InviterCard | null;
      proximity: ProximityResult | null;
      start_blocked_reason: StartBlockedReason | null;
    }
  | {
      ok: false;
      code: ClaimFailureCode;
      inviter: InviterCard | null;
      attempts_left: number | null;
      retry_after_s: number | null;
    };

export type AttributionResult =
  | { ok: true; result: "attributed" | "already_attributed" | "existing_user" | "self" | "invalid" }
  | { ok: false; code: "throttled"; retry_after_s: number | null };

export type AcceptJoinResult =
  | { ok: true; result: "friends" | "already_friends"; inviter: InviterCard | null }
  | { ok: false; code: "invalid" | "self" | "revoked" | "claimer_not_active" | string };

/**
 * `report_match_presence` contexts. `go_live` (athlete-level, no scope) and
 * `arena` (an Arena challenge) are sent through `@jits/shared/api/location`.
 */
export type PresenceContext = "invite_waiting" | "claim" | "booking_open" | "face_off" | "go_live" | "arena";

export interface Booking {
  challenge_id: string;
  invite_id: string;
  role: "inviter" | "invitee";
  opponent: {
    athlete_id: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    current_elo: number;
    current_weight: number | null;
  };
  created_at: string;
  expires_at: string;
  last_check: { verdict: string; reason: string | null; distance_m: number | null; checked_at: string } | null;
}

export interface InviteStats {
  joined_count: number;
  activated_count: number;
  played_count: number;
  open_challenge_invites: number;
  weekly_invite_matches_used: number;
  weekly_invite_matches_cap: number;
}

export type InviteGateway = "universal_link" | "landing_web" | "paste" | "code" | "qr" | "app_clip";
export type InvitePlatform = "ios" | "web";

export function parseInviterCard(v: unknown): InviterCard | null {
  const o = obj(v);
  const id = o && str(o.athlete_id);
  if (!o || !id) return null;
  return {
    athlete_id: id,
    first_name: str(o.first_name),
    last_initial: str(o.last_initial),
    display_name: str(o.display_name) ?? "",
    avatar_url: str(o.avatar_url),
    current_elo: num(o.current_elo) ?? 0,
    weight_lbs: num(o.weight_lbs),
  };
}

function parseProximity(v: unknown): ProximityResult | null {
  const o = obj(v);
  if (!o) return null;
  const verdict = o.verdict === "passed" || o.verdict === "failed" || o.verdict === "waiting" ? o.verdict : null;
  if (!verdict) return null;
  const reason = o.reason === "far" || o.reason === "stale" || o.reason === "accuracy" ? o.reason : null;
  return { verdict, reason, distance_m: num(o.distance_m) };
}

/** Shape a `claim_challenge_invite` payload; null when it is not one. */
export function parseClaimResult(data: unknown): ClaimResult | null {
  const o = obj(data);
  if (!o) return null;
  if (o.ok === true) {
    const result = o.result;
    if (result !== "started" && result !== "booked" && result !== "already_claimed") return null;
    const challengeId = str(o.challenge_id);
    if (!challengeId) return null;
    return {
      ok: true,
      result,
      invite_id: str(o.invite_id) ?? "",
      challenge_id: challengeId,
      match_id: str(o.match_id),
      booking_expires_at: str(o.booking_expires_at),
      inviter: parseInviterCard(o.inviter),
      proximity: parseProximity(o.proximity),
      start_blocked_reason: (str(o.start_blocked_reason) as StartBlockedReason | null) ?? null,
    };
  }
  if (o.ok === false) {
    const code = str(o.code);
    if (!code) return null;
    return {
      ok: false,
      code: code as ClaimFailureCode,
      inviter: parseInviterCard(o.inviter),
      attempts_left: num(o.attempts_left),
      retry_after_s: num(o.retry_after_s),
    };
  }
  return null;
}

function parseChallengeInvite(data: unknown): ChallengeInvite | null {
  const o = obj(data);
  if (!o || !str(o.invite_id) || !str(o.url) || !str(o.token)) return null;
  return o as unknown as ChallengeInvite;
}

function parsePersonalInvite(data: unknown): PersonalInvite | null {
  const o = obj(data);
  if (!o || !str(o.invite_id) || !str(o.url)) return null;
  return o as unknown as PersonalInvite;
}

function parseAttribution(data: unknown): AttributionResult | null {
  const o = obj(data);
  if (!o) return null;
  if (o.ok === true && typeof o.result === "string") return o as unknown as AttributionResult;
  if (o.ok === false && o.code === "throttled") {
    return { ok: false, code: "throttled", retry_after_s: num(o.retry_after_s) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inviter

export function createInvite(supabase: Client, entryPoint: InviteEntryPoint | null = null) {
  return rpc(supabase, "create_invite", { p_entry_point: entryPoint }, parseChallengeInvite);
}

/**
 * Where an invite was created from (`invites.entry_point`, jr_be spec 016).
 * `matches` is the Matches tab zero state's Challenge a friend (C-Z7,
 * specs/matches-tab PM13); the backend accepts it only from jr_be B5
 * (`jr_be-gpz`, migrations `20261008200000..200300`): `create_invite` raises
 * `invalid_entry_point` on an older backend, so B5 must be on prod first.
 */
export const INVITE_ENTRY_POINTS = ["arena", "profile", "verdict", "home", "friends", "matches"] as const;

export type InviteEntryPoint = (typeof INVITE_ENTRY_POINTS)[number];

/** The `from` route param as an entry point, or null for a missing or unknown value. */
export function parseInviteEntryPoint(from: unknown): InviteEntryPoint | null {
  return typeof from === "string" && (INVITE_ENTRY_POINTS as readonly string[]).includes(from) ? (from as InviteEntryPoint) : null;
}

export function refreshInviteCode(supabase: Client, inviteId: string) {
  return rpc(supabase, "refresh_invite_code", { p_invite_id: inviteId }, (d) => {
    const o = obj(d);
    return o && str(o.short_code) ? (o as unknown as RefreshedCode) : null;
  });
}

export function revokeInvite(supabase: Client, inviteId: string) {
  return rpc(supabase, "revoke_invite", { p_invite_id: inviteId }, (d) => {
    const o = obj(d);
    return o && o.status === "revoked" ? { invite_id: str(o.invite_id) ?? inviteId, status: "revoked" as const } : null;
  });
}

export function getOrCreatePersonalInvite(supabase: Client) {
  return rpc(supabase, "get_or_create_personal_invite", {}, parsePersonalInvite);
}

export function getMyInviteStats(supabase: Client) {
  return rpc(supabase, "get_my_invite_stats", {}, (d) => (obj(d) as unknown as InviteStats) ?? null);
}

// ---------------------------------------------------------------------------
// Invitee

export interface InviteInput {
  token?: string | null;
  code?: string | null;
  gateway: InviteGateway;
  platform?: InvitePlatform;
  firstTouchAt?: string | null;
}

function inputArgs(input: InviteInput): Record<string, unknown> {
  return {
    p_token: input.token ?? null,
    p_code: input.code ?? null,
    p_gateway: input.gateway,
    p_platform: input.platform ?? "ios",
    p_first_touch_at: input.firstTouchAt ?? null,
  };
}

export function recordInviteAttribution(supabase: Client, input: InviteInput) {
  return rpc(supabase, "record_invite_attribution", inputArgs(input), parseAttribution);
}

/**
 * Accept a join invite. `gateway` and `platform` attribute the accept and
 * its `join_accepted` event (a QR scan or a pasted link is not a universal
 * link); omitted, the server's defaults apply (`universal_link`, `ios`).
 */
export function acceptJoinInvite(
  supabase: Client,
  token: string,
  opts: { gateway?: InviteGateway; platform?: InvitePlatform } = {},
) {
  const args: Record<string, unknown> = { p_token: token };
  if (opts.gateway) args.p_gateway = opts.gateway;
  if (opts.platform) args.p_platform = opts.platform;
  return rpc<AcceptJoinResult>(supabase, "accept_join_invite", args, (d) => {
    const o = obj(d);
    if (!o) return null;
    if (o.ok === true && (o.result === "friends" || o.result === "already_friends")) {
      return { ok: true, result: o.result, inviter: parseInviterCard(o.inviter) };
    }
    if (o.ok === false) return { ok: false, code: str(o.code) ?? "invalid" };
    return null;
  });
}

export interface LocationReading {
  lat: number;
  lng: number;
  accuracyM: number;
}

export function claimChallengeInvite(supabase: Client, input: InviteInput, reading: LocationReading | null) {
  return rpc(
    supabase,
    "claim_challenge_invite",
    {
      ...inputArgs(input),
      p_lat: reading?.lat ?? null,
      p_lng: reading?.lng ?? null,
      p_accuracy_m: reading?.accuracyM ?? null,
    },
    parseClaimResult,
  );
}

/**
 * Saves the signed-in athlete's own date of birth (`YYYY-MM-DD`), for a claim
 * that came back `dob_required` (accounts from before it was required). The
 * owner UPDATE runs under `athletes_update_own`; `guard_athlete_columns` does
 * not revert `date_of_birth`. RLS turns a wrong id into zero rows, so a row
 * must come back for this to count as saved.
 */
export async function setMyDateOfBirth(
  supabase: Client,
  athleteId: string,
  dateOfBirth: string,
): Promise<InviteResult<{ date_of_birth: string }>> {
  // Saved and compared in one normal form, so padded input is not "not_saved".
  const dob = dateOfBirth.trim();
  try {
    const { data, error } = await supabase
      .from("athletes")
      .update({ date_of_birth: dob })
      .eq("id", athleteId)
      .select("date_of_birth")
      .maybeSingle();
    if (error) return { ok: false, error: { hint: error.hint || "unknown", message: error.message ?? "" } };
    const saved = str((data as { date_of_birth?: unknown } | null)?.date_of_birth);
    if (saved !== dob) {
      return { ok: false, error: { hint: "not_saved", message: "Date of birth was not saved." } };
    }
    return { ok: true, data: { date_of_birth: saved } };
  } catch (err) {
    return { ok: false, error: { hint: "unknown", message: err instanceof Error ? err.message : String(err) } };
  }
}

export function reportMatchPresence(
  supabase: Client,
  reading: LocationReading,
  context: PresenceContext,
  scope: { challengeId: string } | { inviteId: string },
) {
  return rpc(
    supabase,
    "report_match_presence",
    {
      p_lat: reading.lat,
      p_lng: reading.lng,
      p_accuracy_m: reading.accuracyM,
      p_context: context,
      p_challenge_id: "challengeId" in scope ? scope.challengeId : null,
      p_invite_id: "inviteId" in scope ? scope.inviteId : null,
    },
    parsePresence,
  );
}

export function getMyBookings(supabase: Client) {
  return rpc(supabase, "get_my_bookings", {}, (d) => (Array.isArray(d) ? (d as Booking[]) : d == null ? [] : null));
}

// ---------------------------------------------------------------------------
// Telemetry

export type ClientInviteStep = "shared" | "qr_shown" | "token_captured" | "invite_viewed" | "location_denied";

export function logInviteEvent(
  supabase: Client,
  step: ClientInviteStep,
  opts: { inviteId?: string | null; token?: string | null; detail?: Record<string, unknown> } = {},
) {
  return rpc(
    supabase,
    "log_invite_event",
    { p_step: step, p_invite_id: opts.inviteId ?? null, p_token: opts.token ?? null, p_detail: opts.detail ?? {} },
    (d) => (obj(d) ? { logged: obj(d)?.logged === true } : null),
  );
}

// ---------------------------------------------------------------------------
// Flag

/**
 * `invites_enabled` from `feature_flags`: true / false when the read worked
 * (a missing row is off), null when it failed (offline, token refresh), so a
 * caller can retry instead of caching a transient failure as "off".
 */
export async function readInvitesEnabled(supabase: Client): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "invites_enabled")
      .maybeSingle();
    if (error) return null;
    if (!data) return false;
    return (data as { enabled?: boolean }).enabled === true;
  } catch {
    return null;
  }
}

/** `invites_enabled`, fail-closed: any error reads as off. */
export async function isInvitesEnabled(supabase: Client): Promise<boolean> {
  return (await readInvitesEnabled(supabase)) === true;
}

/** Live updates of one invite row (the inviter's waiting screen). */
export function subscribeToInvite(
  supabase: Client,
  inviteId: string,
  onUpdate: (row: { status: string; claimed_by: string | null; challenge_id: string | null }) => void,
): () => void {
  const channel = supabase
    .channel(`invite:${inviteId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "invites", filter: `id=eq.${inviteId}` },
      (payload) => onUpdate(payload.new as { status: string; claimed_by: string | null; challenge_id: string | null }),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** One invite row's status (inviter or claimer only, RLS). Null when unreadable. */
export async function getInviteStatus(
  supabase: Client,
  inviteId: string,
): Promise<{ status: string; claimed_by: string | null; challenge_id: string | null } | null> {
  try {
    const { data, error } = await supabase
      .from("invites")
      .select("status, claimed_by, challenge_id")
      .eq("id", inviteId)
      .maybeSingle();
    if (error || !data) return null;
    return data as { status: string; claimed_by: string | null; challenge_id: string | null };
  } catch {
    return null;
  }
}

/** One of my open challenge invites (the token and link are never readable). */
export interface OpenChallengeInvite {
  id: string;
  short_code: string | null;
  code_expires_at: string | null;
  link_expires_at: string;
  created_at: string;
}

/**
 * My open challenge invites (inviter RLS on `invites`), newest first: the ones
 * that count toward the 5-open limit (`too_many_open_invites`), so each can be
 * withdrawn with `revokeInvite`.
 */
export async function listMyOpenChallengeInvites(
  supabase: Client,
  athleteId: string,
  now: Date = new Date(),
): Promise<InviteResult<OpenChallengeInvite[]>> {
  try {
    const { data, error } = await supabase
      .from("invites")
      .select("id, short_code, code_expires_at, link_expires_at, created_at")
      .eq("inviter_id", athleteId)
      .eq("kind", "challenge")
      .eq("status", "open")
      .gt("link_expires_at", now.toISOString())
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: { hint: error.hint || "unknown", message: error.message ?? "" } };
    return { ok: true, data: Array.isArray(data) ? (data as OpenChallengeInvite[]) : [] };
  } catch (err) {
    return { ok: false, error: { hint: "unknown", message: err instanceof Error ? err.message : String(err) } };
  }
}

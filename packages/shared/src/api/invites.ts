/**
 * Invites (jr_be spec 016, contract section 4). Typed wrappers over the
 * invite RPCs. Every call returns `Result<T>` and never throws: a RAISE comes
 * back as `{ ok:false, error }` (branch on `error.hint`, kept on `hint`), and a
 * returned `{ok:false, code}` JSON is a successful call whose data says so.
 *
 * The RPCs are untyped until `database.ts` is regenerated against the
 * 20261001* migrations, hence the local `rpc` cast.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { ClaimFailureCode, StartBlockedReason } from "../utils/invite-copy";

type Client = SupabaseClient<Database>;

/** A failed call: the RAISE hint (`invites_disabled`, `not_found`, ...) or `unknown`. */
export interface InviteRpcError {
  hint: string;
  message: string;
}

export type InviteResult<T> = { ok: true; data: T } | { ok: false; error: InviteRpcError };

type RawError = { message?: string; hint?: string | null; code?: string } | null;

async function rpc<T>(
  supabase: Client,
  fn: string,
  args: Record<string, unknown>,
  parse: (data: unknown) => T | null,
): Promise<InviteResult<T>> {
  try {
    const call = supabase.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: RawError }>;
    const { data, error } = await call.call(supabase, fn, args);
    if (error) {
      return {
        ok: false,
        error: { hint: error.hint || (error.code === "PGRST202" ? "rpc_missing" : "unknown"), message: error.message ?? "" },
      };
    }
    const parsed = parse(data);
    if (parsed === null) return { ok: false, error: { hint: "unknown", message: `Unexpected ${fn} response.` } };
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: { hint: "unknown", message: err instanceof Error ? err.message : String(err) } };
  }
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

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

export type PresenceContext = "invite_waiting" | "claim" | "booking_open" | "face_off";

export type PresenceResult =
  | {
      ok: true;
      verdict: "passed" | "failed" | "waiting" | "already_started";
      reason: string | null;
      distance_m: number | null;
      started: boolean;
      match_id: string | null;
      start_blocked_reason: StartBlockedReason | null;
    }
  | { ok: false; code: "accuracy_too_low" | "booking_closed" | string };

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

function parsePresence(data: unknown): PresenceResult | null {
  const o = obj(data);
  if (!o) return null;
  if (o.ok === false) return { ok: false, code: str(o.code) ?? "unknown" };
  if (o.ok !== true) return null;
  return {
    ok: true,
    verdict: (str(o.verdict) ?? "waiting") as "passed" | "failed" | "waiting" | "already_started",
    reason: str(o.reason),
    distance_m: num(o.distance_m),
    started: o.started === true,
    match_id: str(o.match_id),
    start_blocked_reason: (str(o.start_blocked_reason) as StartBlockedReason | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Inviter

export function createInvite(supabase: Client, entryPoint: InviteEntryPoint | null = null) {
  return rpc(supabase, "create_invite", { p_entry_point: entryPoint }, parseChallengeInvite);
}

export type InviteEntryPoint = "arena" | "profile" | "verdict" | "home" | "friends";

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

export function acceptJoinInvite(supabase: Client, token: string) {
  return rpc<AcceptJoinResult>(supabase, "accept_join_invite", { p_token: token }, (d) => {
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

/** `invites_enabled` from `feature_flags`. Fail-closed: any error reads as off. */
export async function isInvitesEnabled(supabase: Client): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "invites_enabled")
      .maybeSingle();
    if (error || !data) return false;
    return (data as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
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

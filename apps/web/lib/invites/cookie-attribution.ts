import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INVITE_TOKEN_RE, invitePath } from "./constants";
import { getInvitePreview } from "./preview";
import type { AttributionResult } from "./types";

export interface CookieAttributionDecision {
  /** Remove the er_invite cookie. */
  clear: boolean;
  /** Send the athlete to the landing page to accept (challenge invites). */
  acceptPath: string | null;
  /**
   * record_invite_attribution answered for this token (now or on an earlier
   * request), so later requests can skip it (see INVITE_ATTR_COOKIE).
   */
  recorded?: boolean;
}

const KEEP: CookieAttributionDecision = { clear: false, acceptPath: null };

export type RecordAttributionOutcome = "error" | "rejected" | "recorded";

/**
 * Calls record_invite_attribution as the signed-in athlete (gateway
 * landing_web, platform web). "rejected" covers invalid and self (the
 * cookie is useless); "error" is a transport failure worth retrying.
 */
export async function recordInviteAttribution(
  supabase: SupabaseClient,
  token: string,
): Promise<RecordAttributionOutcome> {
  const { data, error } = await supabase.rpc("record_invite_attribution", {
    p_token: token,
    p_gateway: "landing_web",
    p_platform: "web",
  });
  if (error || !data) return "error";
  const result = data as AttributionResult;
  if (!result.ok || result.result === "invalid" || result.result === "self") return "rejected";
  return "recorded";
}

/**
 * First authenticated request with an er_invite cookie (contract 6): record
 * the attribution (gateway landing_web, platform web), then point challenge
 * invites back at /c/<token> where the athlete accepts. A transport error
 * keeps the cookie so the next request retries; every RPC answer clears it,
 * which also stops a declined challenge from bouncing the athlete back to
 * the landing page on every navigation (the token lives on in the /c URL and
 * in ?next=). For an open challenge, `clear` is applied only once the accept
 * redirect is actually issued (see planInviteCookie in cookie-plan.ts), so a
 * setup page reached first does not drop the challenge.
 *
 * `alreadyRecorded` (the INVITE_ATTR_COOKIE marker matches) skips the RPC:
 * only the redirect decision is made again.
 */
export async function attributeInviteCookie(
  supabase: SupabaseClient,
  token: string | undefined,
  options: { alreadyRecorded?: boolean } = {},
): Promise<CookieAttributionDecision> {
  if (!token) return KEEP;
  if (!INVITE_TOKEN_RE.test(token)) return { clear: true, acceptPath: null };

  if (!options.alreadyRecorded) {
    const outcome = await recordInviteAttribution(supabase, token);
    if (outcome === "error") return KEEP;
    if (outcome === "rejected") return { clear: true, acceptPath: null };
  }

  const preview = await getInvitePreview(token);
  const isOpenChallenge = preview.state === "open" && preview.kind === "challenge";
  return { clear: true, acceptPath: isOpenChallenge ? invitePath(token) : null, recorded: true };
}

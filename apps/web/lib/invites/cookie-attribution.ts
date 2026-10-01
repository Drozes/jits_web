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
}

const KEEP: CookieAttributionDecision = { clear: false, acceptPath: null };

/**
 * First authenticated request with an er_invite cookie (contract 6): record
 * the attribution (gateway landing_web, platform web), then point challenge
 * invites back at /c/<token> where the athlete accepts. A transport error
 * keeps the cookie so the next request retries; every RPC answer clears it,
 * which also stops a declined challenge from bouncing the athlete back to
 * the landing page on every navigation (the token lives on in the /c URL and
 * in ?next=).
 */
export async function attributeInviteCookie(
  supabase: SupabaseClient,
  token: string | undefined,
): Promise<CookieAttributionDecision> {
  if (!token) return KEEP;
  if (!INVITE_TOKEN_RE.test(token)) return { clear: true, acceptPath: null };

  const { data, error } = await supabase.rpc("record_invite_attribution", {
    p_token: token,
    p_gateway: "landing_web",
    p_platform: "web",
  });
  if (error || !data) return KEEP;

  const result = data as AttributionResult;
  if (!result.ok || result.result === "invalid" || result.result === "self") {
    return { clear: true, acceptPath: null };
  }

  const preview = await getInvitePreview(token);
  const isOpenChallenge = preview.state === "open" && preview.kind === "challenge";
  return { clear: true, acceptPath: isOpenChallenge ? invitePath(token) : null };
}

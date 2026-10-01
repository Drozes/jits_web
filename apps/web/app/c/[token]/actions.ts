"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withNext } from "@/lib/auth/safe-next-path";
import {
  INVITE_COOKIE,
  INVITE_COOKIE_OPTIONS,
  INVITE_TOKEN_RE,
  invitePath,
} from "@/lib/invites/constants";
import {
  claimOutcome,
  joinOutcome,
  TRY_AGAIN_OUTCOME,
  type InviteOutcome,
} from "@/lib/invites/outcome-copy";
import type { AcceptJoinResult, ClaimResult } from "@/lib/invites/types";

const INVALID: InviteOutcome = {
  kind: "error",
  title: "Link not valid",
  body: "This invite link isn't valid. Ask your training partner to send it again.",
};

const TRY_AGAIN = TRY_AGAIN_OUTCOME;

/**
 * No cookie write here (CONTRACT DEVIATION, see the 016 web summary): any
 * cookies() mutation in a Server Action makes Next re-render the route, and
 * a claimed challenge then previews as "unavailable", replacing the result
 * the athlete just earned with "Invite unavailable". The pending er_invite
 * cookie is consumed by the proxy instead: on the signed-in arrival at
 * /c/<token>, or on the next request once the invite is no longer open.
 */
function finish(token: string, outcome: InviteOutcome): InviteOutcome {
  if (outcome.kind === "setup") redirect(withNext("/eua", invitePath(token)));
  return outcome;
}

/** Web claim (contract 4.10): no location on web, so it always books. */
export async function claimInviteAction(token: string): Promise<InviteOutcome> {
  if (!INVITE_TOKEN_RE.test(token)) return INVALID;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_challenge_invite", {
    p_token: token,
    p_gateway: "landing_web",
    p_platform: "web",
  });
  if (error?.hint === "not_authenticated") redirect(withNext("/login", invitePath(token)));
  if (error || !data) return TRY_AGAIN;
  return finish(token, claimOutcome(data as ClaimResult));
}

/** Existing athlete opening a join link becomes friends (contract 4.9). */
export async function acceptJoinAction(
  token: string,
  inviterName: string | null,
): Promise<InviteOutcome> {
  if (!INVITE_TOKEN_RE.test(token)) return INVALID;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_join_invite", { p_token: token });
  if (error?.hint === "not_authenticated") redirect(withNext("/login", invitePath(token)));
  if (error || !data) return TRY_AGAIN;
  return finish(token, joinOutcome(data as AcceptJoinResult, inviterName));
}

/**
 * "Signed in as X. Not you?" (contract 7): sign out but keep the pending
 * token so the right person can sign up or log in and still accept.
 */
export async function signOutKeepInviteAction(token: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  if (INVITE_TOKEN_RE.test(token)) {
    (await cookies()).set(INVITE_COOKIE, token, INVITE_COOKIE_OPTIONS);
  }
  redirect(invitePath(token));
}

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
import { claimOutcome, joinOutcome, type InviteOutcome } from "@/lib/invites/outcome-copy";
import type { AcceptJoinResult, ClaimResult } from "@/lib/invites/types";

const INVALID: InviteOutcome = {
  kind: "error",
  title: "Link not valid",
  body: "This invite link isn't valid. Ask your training partner to send it again.",
};

const TRY_AGAIN: InviteOutcome = {
  kind: "error",
  title: "Something went wrong",
  body: "We couldn't reach ELO RATED. Check your connection and try again.",
};

async function finish(token: string, outcome: InviteOutcome): Promise<InviteOutcome> {
  // A claim or join result consumes the pending invite (contract 6).
  (await cookies()).delete(INVITE_COOKIE);
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

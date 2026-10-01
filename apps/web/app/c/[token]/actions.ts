"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAthlete } from "@jits/shared/api/queries";
import { setMyDateOfBirth } from "@jits/shared/api/invites";
import { checkDateOfBirth, DOB_INVALID_COPY, DOB_SAVE_FAILED_COPY, UNDERAGE_COPY } from "@jits/shared/utils";
import { createClient } from "@/lib/supabase/server";
import { withNext } from "@/lib/auth/safe-next-path";
import {
  INVITE_ATTR_COOKIE,
  INVITE_COOKIE,
  INVITE_COOKIE_OPTIONS,
  INVITE_TOKEN_RE,
  invitePath,
} from "@/lib/invites/constants";
import {
  claimOutcome,
  DOB_OUTCOME,
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

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Web claim (contract 4.10): no location on web, so it always books. */
export async function claimInviteAction(token: string): Promise<InviteOutcome> {
  if (!INVITE_TOKEN_RE.test(token)) return INVALID;
  return claimWith(await createClient(), token);
}

/** The DOB step with an inline message (the athlete fixes it and saves again). */
function dobStep(error: string): InviteOutcome {
  return { ...(DOB_OUTCOME as Extract<InviteOutcome, { kind: "dob" }>), error };
}

/**
 * `dob_required` (contract 7): save the signed-in athlete's own date of
 * birth, then retry the same claim. A date that is not real, a date under 16
 * (often a mistyped year) or a failed save stays on the step with an inline
 * message, and nothing is saved for the first two: a saved under-16 date
 * would be permanent and the claim would dead-end on `underage`.
 */
export async function confirmDobAndClaimAction(token: string, dateOfBirth: string): Promise<InviteOutcome> {
  if (!INVITE_TOKEN_RE.test(token)) return INVALID;
  // One normal form for the check and the save.
  const dob = dateOfBirth.trim();
  const check = checkDateOfBirth(dob);
  if (check === "invalid") return dobStep(DOB_INVALID_COPY);
  if (check === "underage") return dobStep(UNDERAGE_COPY);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(withNext("/login", invitePath(token)));
  const athlete = await getCurrentAthlete(supabase, user.id);
  if (!athlete) return dobStep(DOB_SAVE_FAILED_COPY);
  const saved = await setMyDateOfBirth(supabase, athlete.id, dob);
  if (!saved.ok) return dobStep(DOB_SAVE_FAILED_COPY);
  return claimWith(supabase, token);
}

async function claimWith(supabase: ServerClient, token: string): Promise<InviteOutcome> {
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
  const { data, error } = await supabase.rpc("accept_join_invite", {
    p_token: token,
    p_gateway: "landing_web",
    p_platform: "web",
  });
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
    const jar = await cookies();
    jar.set(INVITE_COOKIE, token, INVITE_COOKIE_OPTIONS);
    // The next person signing in must be attributed afresh.
    jar.delete(INVITE_ATTR_COOKIE);
  }
  redirect(invitePath(token));
}

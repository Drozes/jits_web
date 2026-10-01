/**
 * Where `app/index.tsx` sends the app on launch when an invite is pending
 * (jr_be spec 016, contract 6 and plan 10). Pure so the resume rules are
 * tested without the router.
 *
 *  - Signed out: signup first (not login); the banner reads the pending invite.
 *  - Signed in, profile unfinished: the one-screen invite setup (it attributes
 *    first, then finishes the profile, then runs the claim).
 *  - Signed in and active: the claim runner.
 *  - No pending invite: null, the normal redirects apply.
 */
import type { PendingInvite } from "./pending-invite";

export const INVITE_SETUP_HREF = "/invite-setup" as const;
export const INVITE_CLAIM_HREF = "/invite/claim" as const;
export const SIGNUP_HREF = "/signup" as const;

export type InviteLaunchRoute = typeof INVITE_SETUP_HREF | typeof INVITE_CLAIM_HREF | typeof SIGNUP_HREF;

export function inviteLaunchRoute(state: {
  pending: PendingInvite | null;
  signedIn: boolean;
  athleteStatus: string | null | undefined;
}): InviteLaunchRoute | null {
  if (!state.pending) return null;
  if (!state.signedIn) return SIGNUP_HREF;
  if (!state.athleteStatus || state.athleteStatus === "pending") return INVITE_SETUP_HREF;
  return INVITE_CLAIM_HREF;
}

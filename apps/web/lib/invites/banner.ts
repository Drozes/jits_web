import "server-only";
import { inviterFirstName } from "./format";
import { inviteTokenFromNextPath } from "./next-path";
import { getInvitePreview } from "./preview";


/**
 * Signup banner for the invite path (contract 7): `<ALEX> challenged you.
 * Create your account to accept.` / `<ALEX> invited you. Create your account
 * to join.` Null when there is no open invite behind ?next=.
 */
export async function inviteSignupBanner(next: string | null): Promise<string | null> {
  const token = inviteTokenFromNextPath(next);
  if (!token) return null;
  const preview = await getInvitePreview(token);
  if (preview.state !== "open") return null;
  const who = inviterFirstName(preview.inviter);
  return preview.kind === "challenge"
    ? `${who} challenged you. Create your account to accept.`
    : `${who} invited you. Create your account to join.`;
}

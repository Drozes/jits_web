/** Raw invite token: 16 random bytes, base64url, no padding (contract 2). */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

/** Pre-auth invite cookie (contract 6). Holds the raw token for 7 days. */
export const INVITE_COOKIE = "er_invite";
export const INVITE_COOKIE_MAX_AGE_S = 604_800;

export const INVITE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: INVITE_COOKIE_MAX_AGE_S,
};

/**
 * Marks the er_invite token already recorded by record_invite_attribution.
 * An open challenge keeps er_invite through the setup pages (cookie-plan.ts);
 * without this marker every signed-in GET there would call the public RPC
 * again and log a spurious attribution_rejected (already_attributed) event.
 * Holds the same token; it counts only while it equals er_invite.
 */
export const INVITE_ATTR_COOKIE = "er_invite_attr";

export function inviteSchemeUrl(token: string): string {
  return `elorated://c/${token}`;
}

export function invitePath(token: string): string {
  return `/c/${token}`;
}

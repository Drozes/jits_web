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
 * App Store listing. The listing is not live yet, so this falls back to the
 * App Store search for the app name until NEXT_PUBLIC_APP_STORE_URL is set.
 * TODO(jits-b3js): set NEXT_PUBLIC_APP_STORE_URL once the listing is public.
 */
export const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ||
  "https://apps.apple.com/search?term=ELO%20RATED";

export function inviteSchemeUrl(token: string): string {
  return `elorated://c/${token}`;
}

export function invitePath(token: string): string {
  return `/c/${token}`;
}

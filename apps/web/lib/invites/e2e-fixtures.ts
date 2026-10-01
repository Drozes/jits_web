import type { InvitePreview } from "./types";

/**
 * Playwright seam: the preview is fetched server-side with the service key,
 * which a browser test cannot intercept. When E2E_INVITE_FIXTURES=1 (set only
 * by playwright.config.ts on its own dev server, never in production) these
 * fixed tokens resolve to canned previews. Every other token goes to the RPC.
 */
export const E2E_TOKENS = {
  challenge: "e2eChallengeTokenAAAAA",
  join: "e2eJoinTokenAAAAAAAAAA",
  unavailable: "e2eUnavailableTokenAAA",
} as const;

const INVITER = {
  first_name: "Alex",
  last_initial: "R",
  avatar_url: null,
  current_elo: 1482,
  weight_lbs: 172,
};

export function e2eFixturePreview(token: string): InvitePreview | null {
  if (process.env.E2E_INVITE_FIXTURES !== "1" || process.env.NODE_ENV === "production") {
    return null;
  }
  switch (token) {
    case E2E_TOKENS.challenge:
      return { state: "open", kind: "challenge", inviter: INVITER, short_code_display: "K7Q-4M2" };
    case E2E_TOKENS.join:
      return { state: "open", kind: "join", inviter: INVITER, short_code_display: null };
    case E2E_TOKENS.unavailable:
      return { state: "unavailable" };
    default:
      return null;
  }
}

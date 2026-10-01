import type { CookieAttributionDecision } from "./cookie-attribution";

/**
 * Paths where a pending invite cookie is NOT consumed: the landing page
 * itself, APIs and auth plumbing (the callback consumes it explicitly), and
 * static well-known files.
 */
export const INVITE_SKIP_RE = /^\/(c|api|auth|\.well-known|_next)(\/|$)/;

/** Setup and auth pages: attribution runs, but the accept redirect would interrupt. */
export const INVITE_NO_REDIRECT_RE = /^\/(signup|login|eua|confirm|update-password|forgot-password)(\/|$)/;

export interface InviteCookiePlan {
  /** Path to redirect to (the landing page to accept), or null to continue. */
  redirectTo: string | null;
  /** Delete the er_invite cookie on this response. */
  clear: boolean;
}

/**
 * What the proxy does with a pending er_invite cookie on a signed-in GET of
 * `pathname`, given the attribution decision.
 *
 * An open challenge keeps its cookie until the accept redirect is actually
 * issued: on a setup page (/signup, /eua, ...) the cookie survives, so the
 * first ordinary page afterwards sends the athlete back to accept once and
 * only then clears it. Everything else follows the decision.
 */
export function planInviteCookie(decision: CookieAttributionDecision, pathname: string): InviteCookiePlan {
  if (decision.acceptPath) {
    if (INVITE_NO_REDIRECT_RE.test(pathname)) return { redirectTo: null, clear: false };
    return { redirectTo: decision.acceptPath, clear: true };
  }
  return { redirectTo: null, clear: decision.clear };
}

/**
 * The OAuth callback's target and cookie handling: a challenge goes back to
 * its landing page unless ?next= already points somewhere specific; the
 * cookie for an open challenge is cleared only when the callback sends the
 * athlete to accept it.
 */
export function planCallbackInvite(decision: CookieAttributionDecision, next: string): InviteCookiePlan & { target: string } {
  const target = next === "/" && decision.acceptPath ? decision.acceptPath : next;
  const clear = decision.acceptPath ? target === decision.acceptPath : decision.clear;
  return { target, redirectTo: target, clear };
}

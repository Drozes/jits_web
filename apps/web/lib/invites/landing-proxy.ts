import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { INVITE_COOKIE, INVITE_COOKIE_OPTIONS, INVITE_TOKEN_RE } from "./constants";
import { logLandingEvent } from "./landing-events";
import { getInvitePreview } from "./preview";
import { detectInAppBrowser, isLinkPreviewCrawler } from "./user-agent";

const LANDING_PATH_RE = /^\/c\/([^/]+)\/?$/;

/** The token when the request is a GET of the landing page itself. */
export function landingToken(request: NextRequest): string | null {
  if (request.method !== "GET") return null;
  const match = LANDING_PATH_RE.exec(request.nextUrl.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Side effects of GET /c/<token> (contract 6): the only ones allowed are the
 * er_invite cookie and the landing_viewed event. Server Components cannot
 * set cookies, so they happen here in the proxy.
 *
 * The cookie is set for signed-out visitors only: a signed-in athlete
 * accepts on the page itself (claim attributes internally), and a cookie
 * would only bounce them back here later (CONTRACT DEVIATION, see summary).
 * Prefetches (Next router, browser speculation) are not views.
 */
export async function applyLandingSideEffects(
  request: NextRequest,
  response: NextResponse,
  token: string,
  signedIn: boolean,
): Promise<void> {
  if (!INVITE_TOKEN_RE.test(token)) return;
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch");
  if (isPrefetch) return;

  const ua = request.headers.get("user-agent");
  const preview = await getInvitePreview(token);
  const open = preview.state === "open";

  if (open && !signedIn) {
    response.cookies.set(INVITE_COOKIE, token, INVITE_COOKIE_OPTIONS);
  }
  if (!isLinkPreviewCrawler(ua)) {
    await logLandingEvent(token, "landing_viewed", {
      in_app_browser: detectInAppBrowser(ua),
      kind: open ? preview.kind : null,
    });
  }
}

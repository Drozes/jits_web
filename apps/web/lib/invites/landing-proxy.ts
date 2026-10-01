import "server-only";
import { after, type NextRequest, type NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INVITE_ATTR_COOKIE, INVITE_COOKIE, INVITE_COOKIE_OPTIONS, INVITE_TOKEN_RE } from "./constants";
import { recordInviteAttribution } from "./cookie-attribution";
import { logLandingEvent } from "./landing-events";
import { getInvitePreview } from "./preview";
import { detectInAppBrowser, isLinkPreviewCrawler } from "./user-agent";

const LANDING_PATH_RE = /^\/c\/([^/]+)\/?$/;

/** The token when the request is a GET of the landing page itself. */
export function landingToken(request: NextRequest): string | null {
  if (request.method !== "GET") return null;
  const match = LANDING_PATH_RE.exec(request.nextUrl.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // Malformed percent-encoding: keep the raw segment, which fails the
    // token format check and renders the uniform unavailable page.
    return match[1];
  }
}

/**
 * Browser speculation (Speculation Rules, link rel=prefetch) is not a
 * navigation. Next strips its own flight headers (`rsc`,
 * `next-router-prefetch`) before the proxy runs, so router prefetches are
 * only caught when they carry `next-router-prefetch` outside Next's adapter
 * (kept for safety); see isDocumentRequest for client-side navigations.
 */
export function isPrefetch(request: NextRequest): boolean {
  return (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    !!request.headers.get("sec-purpose")?.includes("prefetch")
  );
}

/**
 * A top-level document load. Client-side (RSC) navigations (router.push
 * after login or setup, a server-action redirect, back navigation) and
 * router prefetches are fetch() calls with `Sec-Fetch-Dest: empty`; they are
 * not fresh opens. A client that sends no fetch metadata counts as a
 * document (old browsers, crawlers, which are filtered by user agent).
 */
export function isDocumentRequest(request: NextRequest): boolean {
  const dest = request.headers.get("sec-fetch-dest");
  return !dest || dest === "document";
}

/**
 * Side effects of GET /c/<token> (contract 6): the only ones allowed are the
 * er_invite cookie and the landing_viewed event. Server Components cannot
 * set cookies, so they happen here in the proxy.
 *
 * The cookie is set for signed-out visitors only: a signed-in athlete
 * accepts on the page itself (claim attributes internally), and a cookie
 * would only bounce them back here later (CONTRACT DEVIATION, see summary).
 * A signed-in athlete who arrives here with this token pending has reached
 * the accept step, so the pending cookie is consumed now (it would
 * otherwise bounce them back after they decide not to accept). Consuming it
 * is their first authenticated request with the cookie (password login
 * goes straight here via ?next=), so the attribution is recorded first,
 * unless the er_invite_attr marker says it already was. A transport error
 * keeps the cookie so a later request retries.
 *
 * Speculative prefetches are not views, nor are client-side navigations
 * back to the page. The event insert runs after the response (after()),
 * off the critical path of a slow in-app browser.
 */
export async function applyLandingSideEffects(
  request: NextRequest,
  response: NextResponse,
  token: string,
  /** The signed-in athlete's client, or null for a signed-out visitor. */
  supabase: SupabaseClient | null,
): Promise<void> {
  const signedIn = supabase !== null;
  if (!INVITE_TOKEN_RE.test(token)) return;
  if (isPrefetch(request)) return;

  const ua = request.headers.get("user-agent");
  const preview = await getInvitePreview(token);
  const open = preview.state === "open";

  if (open && !signedIn) {
    response.cookies.set(INVITE_COOKIE, token, INVITE_COOKIE_OPTIONS);
    // A fresh visitor must be attributed afresh once they sign in.
    if (request.cookies.has(INVITE_ATTR_COOKIE)) response.cookies.delete(INVITE_ATTR_COOKIE);
  }
  if (supabase && request.cookies.get(INVITE_COOKIE)?.value === token) {
    const alreadyRecorded = request.cookies.get(INVITE_ATTR_COOKIE)?.value === token;
    const outcome = alreadyRecorded ? "recorded" : await recordInviteAttribution(supabase, token);
    if (outcome !== "error") {
      response.cookies.delete(INVITE_COOKIE);
      response.cookies.delete(INVITE_ATTR_COOKIE);
    }
  }
  if (!isLinkPreviewCrawler(ua) && isDocumentRequest(request)) {
    const detail = {
      in_app_browser: detectInAppBrowser(ua),
      kind: open ? preview.kind : null,
    };
    after(() => logLandingEvent(token, "landing_viewed", detail));
  }
}

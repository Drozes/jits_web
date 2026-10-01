import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { isPublicPath } from "./public-paths";
import { INVITE_COOKIE } from "../invites/constants";
import { attributeInviteCookie } from "../invites/cookie-attribution";
import { applyLandingSideEffects, landingToken } from "../invites/landing-proxy";

/**
 * Paths where a pending invite cookie is NOT consumed: the landing page
 * itself, APIs and auth plumbing (the callback consumes it explicitly), and
 * static well-known files.
 */
const INVITE_SKIP_RE = /^\/(c|api|auth|\.well-known|_next)(\/|$)/;
/** Paths where attribution runs but the accept redirect would interrupt. */
const INVITE_NO_REDIRECT_RE = /^\/(signup|login|eua|confirm|update-password|forgot-password)(\/|$)/;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // The public list (incl. why /design is NOT on it) lives in public-paths.ts.
  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const token = landingToken(request);
  if (token) {
    await applyLandingSideEffects(request, supabaseResponse, token, !!user);
    // Also set in next.config headers(); repeated here because Next's own
    // dynamic-page Cache-Control would otherwise win over the config rule.
    supabaseResponse.headers.set("Cache-Control", "private, no-store");
    return supabaseResponse;
  }

  const inviteCookie = request.cookies.get(INVITE_COOKIE)?.value;
  const { pathname } = request.nextUrl;
  if (user && inviteCookie && request.method === "GET" && !INVITE_SKIP_RE.test(pathname)) {
    const decision = await attributeInviteCookie(supabase, inviteCookie);
    if (decision.acceptPath && !INVITE_NO_REDIRECT_RE.test(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = decision.acceptPath;
      url.search = "";
      const redirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      if (decision.clear) redirect.cookies.delete(INVITE_COOKIE);
      return redirect;
    }
    if (decision.clear) supabaseResponse.cookies.delete(INVITE_COOKIE);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}

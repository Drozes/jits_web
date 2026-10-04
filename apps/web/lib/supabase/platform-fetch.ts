/**
 * The `x-elo-platform: web` header (jr_be 016 addendum, live location fixes
 * 4.4). The backend's `_request_platform()` reads it from PostgREST's
 * `request.headers` into `athlete_live_sessions.platform` and
 * `athlete_location_events.platform`.
 *
 * Sent on PostgREST requests (`/rest/v1/`) ONLY, not through supabase-js's
 * `global.headers`, which would put it on every request including edge
 * function calls. Edge functions answer their own CORS preflight, and on the
 * hosted project `delete-account` allows only `authorization, x-client-info,
 * apikey, content-type` (verified 2026-10-02 with an OPTIONS request), so a
 * global custom header would fail the browser's preflight and break account
 * deletion on web. The API gateway's CORS for `/rest/v1/`, `/auth/v1/` and
 * `/storage/v1/` echoes the requested headers (verified against the hosted
 * and the local stack).
 */
export const PLATFORM_HEADER = "x-elo-platform";

/** True for `<supabase url>/rest/v1/...` exactly (no other host or path). */
export function isRestRequest(url: string, supabaseUrl: string): boolean {
  const base = supabaseUrl.replace(/\/+$/, "");
  return base.length > 0 && url.startsWith(`${base}/rest/v1/`);
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** A `fetch` that adds `x-elo-platform: web` to this project's PostgREST requests. */
export function platformFetch(
  supabaseUrl: string,
  base: typeof fetch = (...args) => fetch(...args),
): typeof fetch {
  return (input, init) => {
    if (!isRestRequest(urlOf(input), supabaseUrl)) return base(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(PLATFORM_HEADER, "web");
    return base(input, { ...init, headers });
  };
}

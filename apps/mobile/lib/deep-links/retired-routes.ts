/**
 * Route families mobile no longer has (jits-gewv): gym sessions, the gym list
 * and detail pages, and the gym-manager portal. The Arena is the only way to a
 * match now.
 *
 * Links to them still exist in the wild: web share URLs, universal links, and
 * push payloads written before the removal (or by a backend that still speaks
 * web's route set). Navigating to one would land on expo-router's unmatched
 * route screen, so every external entry point checks here first and sends the
 * athlete Home instead.
 */

/** Auth-aware root: `app/index.tsx` redirects a signed-in athlete to Home. */
export const HOME_HREF = "/";

const RETIRED_ROUTE = /^\/(?:session|gyms|gym-manager)(?:[/?#]|$)/;

/**
 * True when `route` points into a removed route family, in any spelling:
 * with or without a leading slash, and with or without route-group segments
 * such as `(app)`, which expo-router treats as absent from the URL.
 */
export function isRetiredRoute(route: string): boolean {
  const normalized = `/${route.trim().replace(/^\/+/, "")}`.replace(
    /\/\([^/]+\)(?=\/|$)/g,
    "",
  );
  return RETIRED_ROUTE.test(normalized || "/");
}

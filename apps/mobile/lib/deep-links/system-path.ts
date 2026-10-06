import { HOME_HREF, isRetiredRoute } from "./retired-routes";

/**
 * The retired Film Room screen (`/film-room`, also written with its groups as
 * `/(app)/film-room`), with or without a trailing slash.
 */
/** The Matches tab as a URL path (groups are not part of a URL). */
const MATCHES_TAB_PATH = "/matches";

const FILM_ROOM_PATH = /^(\/\(app\))?\/film-room\/?$/;

/**
 * Rewrites an incoming system URL before expo-router routes it. Wired up by
 * `app/+native-intent.tsx`, which expo-router calls for the launch URL and for
 * every URL received while running (getLinkingConfig / link/linking.js,
 * expo-router 6.0.23). Everything expo-router can route by itself
 * (`elorated://athlete/<id>`, `https://elorated.com/athlete/<id>`,
 * `elorated://login`, the dev-client launcher URL) is returned UNCHANGED, so
 * expo-router stays the single thing that navigates for a link.
 *
 * Only three families are rewritten:
 *
 * - Retired routes (`session`, `gyms`, `gym-manager`; jits-gewv): Home.
 *   Rewriting here, before navigation, is what keeps the Unmatched screen out
 *   of the stack entirely. Pushing Home after the fact left it behind Home.
 * - `reset-password`: `/login`, the Supabase recovery `redirectTo` in
 *   lib/auth/auth-context.tsx. There is no reset-password screen yet. The
 *   query string and hash are carried over byte for byte.
 * - The retired Film Room (`/film-room`, spec specs/matches-tab/spec.md
 *   4.2): the Matches tab. Rewriting before navigation means the link opens
 *   the one tab bar's Matches tab instead of mounting the redirect screen.
 */
export function resolveSystemPath(url: string): string {
  const { routePath, suffix } = splitUrl(url);
  if (routePath === null) return url;
  if (isRetiredRoute(routePath)) return HOME_HREF;
  if (/^\/reset-password\/?$/.test(routePath)) return `/login${suffix}`;
  if (FILM_ROOM_PATH.test(routePath)) return MATCHES_TAB_PATH;
  return url;
}

/**
 * The in-app route path of a URL, with a leading slash and no query or hash,
 * plus the untouched `?query#hash` tail. Mirrors how expo-router reads a URL
 * (fork/extractPathFromURL.js): a web link contributes only its pathname, and
 * a custom scheme's HOST is the first path segment (`elorated://athlete/x` is
 * `/athlete/x`). Null when the input is not recognisably a URL or path.
 */
function splitUrl(url: string): { routePath: string | null; suffix: string } {
  const tailAt = url.search(/[?#]/);
  const head = tailAt === -1 ? url : url.slice(0, tailAt);
  const suffix = tailAt === -1 ? "" : url.slice(tailAt);

  const web = head.match(/^https?:\/\/[^/]*(\/.*)?$/i);
  if (web) return { routePath: web[1] ?? "/", suffix };

  const custom = head.match(/^[a-z][a-z0-9+.-]*:\/\/(.*)$/i);
  if (custom) {
    // Expo Go style `exp://host:port/--/path`: the route follows the `--`.
    const rest = custom[1];
    const goAt = rest.indexOf("/--/");
    return {
      routePath: `/${goAt === -1 ? rest : rest.slice(goAt + 4)}`,
      suffix,
    };
  }

  if (head.startsWith("/")) return { routePath: head, suffix };
  return { routePath: null, suffix };
}
